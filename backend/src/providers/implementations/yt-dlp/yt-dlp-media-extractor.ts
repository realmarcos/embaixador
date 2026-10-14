import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { AppError } from "../../../errors/app-errors";
import { MediaExtractorProvider } from "../../media-extractor";
import {
  DownloadedMedia,
  MediaAnalysis,
  MediaDownloadRequest,
  MediaOption,
  MediaPlatform,
} from "../../media-extractor/types";
import { ValidateMediaUrlService } from "../../../services/downloads/validate-media-url-service";

const execFileAsync = promisify(execFile);
const processTimeoutMs = 5 * 60 * 1000;
const maximumOutputBytes = 5 * 1024 * 1024;

interface CommandOptions {
  cwd: string;
  timeoutMs: number;
  maxBufferBytes: number;
  env: NodeJS.ProcessEnv;
  shell: false;
}

type CommandRunner = (executablePath: string, args: string[], options: CommandOptions) => Promise<string>;

interface YtDlpMediaExtractorDependencies {
  executablePath: string;
  urlValidator: Pick<ValidateMediaUrlService, "execute">;
  proxyUrl?: () => string;
  noCheckCertificates?: boolean;
  run?: CommandRunner;
}

interface YtDlpFormat {
  format_id?: unknown;
  ext?: unknown;
  width?: unknown;
  height?: unknown;
  format_note?: unknown;
  resolution?: unknown;
  acodec?: unknown;
  vcodec?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runProcess(executablePath: string, args: string[], options: CommandOptions): Promise<string> {
  return execFileAsync(executablePath, args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeoutMs,
    maxBuffer: options.maxBufferBytes,
    windowsHide: true,
    shell: options.shell,
    encoding: "utf8",
  }).then(({ stdout }) => stdout);
}

function providerEnvironment(temporaryDirectory: string, proxyUrl?: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "",
    HOME: temporaryDirectory,
    XDG_CONFIG_HOME: temporaryDirectory,
    XDG_CACHE_HOME: temporaryDirectory,
    YTDLP_NO_PLUGINS: "1",
    PYTHONNOUSERSITE: "1",
  };
  if (proxyUrl) {
    Object.assign(environment, {
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      ALL_PROXY: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
      all_proxy: proxyUrl,
      NO_PROXY: "",
      no_proxy: "",
    });
  }
  return environment;
}

function safeProviderError(operation: "analysis" | "download"): AppError {
  return operation === "analysis"
    ? new AppError({
        message: "Unable to analyze this media right now",
        code: "MEDIA_ANALYSIS_FAILED",
        statusCode: 502,
        exposeMessage: true,
      })
    : new AppError({
        message: "Unable to download this media right now",
        code: "MEDIA_DOWNLOAD_FAILED",
        statusCode: 502,
        exposeMessage: true,
      });
}

function analysisError(code: string, message: string, statusCode = 502): AppError {
  return new AppError({ code, message, statusCode, exposeMessage: true });
}

function classifyAnalysisFailure(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const failure = isRecord(error) || error instanceof Error ? error : undefined;
  const code: unknown = failure && "code" in failure ? failure.code : undefined;
  const killed: unknown = failure && "killed" in failure ? failure.killed : undefined;
  const stderr: unknown = failure && "stderr" in failure ? failure.stderr : undefined;
  // Match diagnostics locally, but never return raw stderr, URLs or process arguments.
  const diagnostic = typeof stderr === "string" ? stderr.slice(0, maximumOutputBytes).toLowerCase() : "";
  if (code === "ENOENT" || code === "EACCES" || code === "EPERM") {
    return analysisError(
      "MEDIA_EXTRACTOR_UNAVAILABLE",
      "The media analyzer could not be started. Ask the administrator to check YT_DLP_PATH and executable permissions.",
      503,
    );
  }
  if (killed === true || code === "ETIMEDOUT" || /timed out|timeout/.test(diagnostic)) {
    return analysisError(
      "MEDIA_ANALYSIS_TIMEOUT",
      "Media analysis timed out. Try again; if this persists, ask the administrator to check the proxy and connection.",
      504,
    );
  }
  if (/proxy authentication required|http error 407|tunnel connection failed: 407/.test(diagnostic)) {
    return analysisError(
      "MEDIA_PROXY_AUTHENTICATION_FAILED",
      "The proxy rejected authentication. Ask the administrator to check the proxy username and password.",
    );
  }
  if (/proxyerror|unable to connect to proxy|cannot connect to proxy|tunnel connection failed/.test(diagnostic)) {
    return analysisError(
      "MEDIA_PROXY_CONNECTION_FAILED",
      "Could not connect through the media proxy. Ask the administrator to check proxy availability and configuration.",
    );
  }
  if (/sign in to confirm|login required|log in to|authentication required|cookies are needed|private video/.test(diagnostic)) {
    return analysisError(
      "MEDIA_AUTHENTICATION_REQUIRED",
      "The platform requires login or verification. Use a public media link; this application does not provide platform login.",
    );
  }
  if (/http error 429|too many requests/.test(diagnostic)) {
    return analysisError("MEDIA_RATE_LIMITED", "The platform is limiting requests. Wait before trying again.");
  }
  if (/http error 403|http error 401|access denied|not available in your country|geo.?restricted/.test(diagnostic)) {
    return analysisError(
      "MEDIA_ACCESS_DENIED",
      "The platform denied access to this media. Check that the link is public and accessible from the server or proxy region.",
    );
  }
  if (
    /video (?:is )?unavailable|video has been removed|http error 404|no longer available/.test(diagnostic)
  ) {
    return analysisError(
      "MEDIA_UNAVAILABLE",
      "This media is unavailable or has been removed. Check the link and try another public media.",
    );
  }
  if (/certificate_verify_failed|certificate verify failed/.test(diagnostic)) {
    return analysisError(
      "MEDIA_TLS_FAILED",
      "Certificate verification failed. Ask the administrator to check server certificates and the proxy; do not disable TLS verification.",
    );
  }
  if (
    code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ECONNRESET" ||
    /name or service not known|temporary failure in name resolution|getaddrinfo failed|connection refused|connection reset/.test(diagnostic)
  ) {
    return analysisError(
      "MEDIA_CONNECTION_FAILED",
      "Could not reach the media platform. Check the server or proxy connection and try again.",
    );
  }
  return analysisError(
    "MEDIA_ANALYSIS_FAILED",
    "Could not analyze this media. Check that the link is public; ask the administrator to check connectivity and update yt-dlp.",
  );
}

function platformFromExtractor(value: unknown): MediaPlatform | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const extractor = value.toLowerCase();
  if (extractor.includes("youtube")) {
    return "YOUTUBE";
  }
  if (extractor.includes("instagram")) {
    return "INSTAGRAM";
  }
  if (extractor.includes("facebook")) {
    return "FACEBOOK";
  }
  return undefined;
}

function safeText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);

  return normalized.length > 0 ? normalized : null;
}

function safeDimension(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8640
    ? value
    : null;
}

function hasCodec(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0 && !["none", "unknown"].includes(value.trim().toLowerCase());
}

function toMediaOption(value: unknown): MediaOption | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const format = value as YtDlpFormat;
  const id = safeText(format.format_id, 128);
  const container = safeText(format.ext, 16)?.toLowerCase();
  if (!id || !/^[a-z0-9._+-]+$/i.test(id) || !container || !/^[a-z0-9]+$/i.test(container)) {
    return undefined;
  }

  return {
    id,
    container,
    width: safeDimension(format.width),
    height: safeDimension(format.height),
    qualityLabel: safeText(format.format_note, 80) ?? safeText(format.resolution, 80),
    isOriginal: true,
    hasAudio: hasCodec(format.acodec),
    hasVideo: hasCodec(format.vcodec),
  };
}

function mimeTypeFor(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  const mediaTypes: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/opus",
  };

  return extension ? mediaTypes[extension] ?? "application/octet-stream" : "application/octet-stream";
}

function isInsideDirectory(directory: string, filePath: string): boolean {
  const relativePath = relative(directory, filePath);
  return relativePath.length > 0 && relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

class YtDlpMediaExtractor implements MediaExtractorProvider {
  private readonly run: CommandRunner;

  constructor(private readonly dependencies: YtDlpMediaExtractorDependencies) {
    this.run = dependencies.run ?? runProcess;
  }

  async analyze(url: string): Promise<MediaAnalysis> {
    const validated = await this.dependencies.urlValidator.execute(url);
    try {
      const proxyUrl = this.dependencies.proxyUrl?.();
      const output = await this.run(
        this.dependencies.executablePath,
        [
          "--ignore-config",
          ...(validated.platform === "YOUTUBE" ? ["--js-runtimes", `node:${process.execPath}`] : []),
          ...(proxyUrl ? ["--proxy", proxyUrl] : []),
          ...(this.dependencies.noCheckCertificates ? ["--no-check-certificates"] : []),
          "--no-plugin-dirs",
          "--no-cookies",
          "--no-remote-components",
          "--no-warnings",
          "--quiet",
          "--dump-single-json",
          "--skip-download",
          validated.url,
        ],
        {
          cwd: process.cwd(),
          timeoutMs: processTimeoutMs,
          maxBufferBytes: maximumOutputBytes,
          env: providerEnvironment(process.cwd(), proxyUrl),
          shell: false,
        },
      );

      let info: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(output);
        if (!isRecord(parsed)) {
          throw new Error("Invalid extractor response");
        }
        info = parsed;
      } catch {
        throw analysisError(
          "MEDIA_ANALYSIS_INVALID_RESPONSE", "The analyzer returned an invalid response. Ask the administrator to update yt-dlp.",
        );
      }

      if (platformFromExtractor(info.extractor_key) !== validated.platform) {
        throw analysisError(
          "MEDIA_ANALYSIS_INVALID_RESPONSE", "The analyzer returned an unexpected platform. Check the link and update yt-dlp.",
        );
      }

      const formats = Array.isArray(info.formats) ? info.formats : [];
      const options = formats
        .map(toMediaOption)
        .filter((option): option is MediaOption => option !== undefined);
      if (options.length === 0) {
        throw analysisError(
          "MEDIA_NO_FORMATS", "No supported media formats were found. Try another public link or ask the administrator to update yt-dlp.",
        );
      }

      return {
        platform: validated.platform,
        title: safeText(info.title, 512),
        thumbnailUrl: null,
        options,
      };
    } catch (error) {
      throw classifyAnalysisFailure(error);
    }
  }

  async download(request: MediaDownloadRequest): Promise<DownloadedMedia> {
    const validated = await this.dependencies.urlValidator.execute(request.url);
    if (!/^[a-z0-9._+-]{1,128}$/i.test(request.formatId)) {
      throw safeProviderError("download");
    }

    const outputDirectory = resolve(request.outputDirectory);
    try {
      const proxyUrl = this.dependencies.proxyUrl?.();
      const output = await this.run(
        this.dependencies.executablePath,
        [
          "--ignore-config",
          ...(validated.platform === "YOUTUBE" ? ["--js-runtimes", `node:${process.execPath}`] : []),
          ...(proxyUrl ? ["--proxy", proxyUrl] : []),
          ...(this.dependencies.noCheckCertificates ? ["--no-check-certificates"] : []),
          "--no-plugin-dirs",
          "--no-cookies",
          "--no-remote-components",
          "--no-write-info-json",
          "--no-write-description",
          "--no-write-thumbnail",
          "--no-progress",
          "--no-warnings",
          "--quiet",
          `--format=${request.formatId}`,
          "--output",
          resolve(outputDirectory, "%(title)s.%(ext)s"),
          "--print",
          "after_move:filepath",
          validated.url,
        ],
        {
          cwd: outputDirectory,
          timeoutMs: processTimeoutMs,
          maxBufferBytes: maximumOutputBytes,
          env: providerEnvironment(outputDirectory, proxyUrl),
          shell: false,
        },
      );

      const printedPath = output.trim().split(/\r?\n/).pop();
      if (!printedPath) {
        throw safeProviderError("download");
      }

      const filePath = resolve(printedPath);
      if (!isInsideDirectory(outputDirectory, filePath)) {
        throw safeProviderError("download");
      }

      const file = await stat(filePath);
      if (!file.isFile() || file.size <= 0) {
        throw safeProviderError("download");
      }

      const fileName = basename(filePath);
      return {
        filePath,
        fileName,
        mimeType: mimeTypeFor(fileName),
        sizeBytes: file.size,
      };
    } catch {
      throw safeProviderError("download");
    }
  }
}

export { YtDlpMediaExtractor };