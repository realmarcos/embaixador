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
      })
    : new AppError({
        message: "Unable to download this media right now",
        code: "MEDIA_DOWNLOAD_FAILED",
        statusCode: 502,
      });
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
      const output = await this.run(
        this.dependencies.executablePath,
        [
          "--ignore-config",
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
          env: providerEnvironment(process.cwd(), this.dependencies.proxyUrl?.()),
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
        throw safeProviderError("analysis");
      }

      if (platformFromExtractor(info.extractor_key) !== validated.platform) {
        throw safeProviderError("analysis");
      }

      const formats = Array.isArray(info.formats) ? info.formats : [];
      const options = formats
        .map(toMediaOption)
        .filter((option): option is MediaOption => option !== undefined);
      if (options.length === 0) {
        throw safeProviderError("analysis");
      }

      return {
        platform: validated.platform,
        title: safeText(info.title, 512),
        thumbnailUrl: null,
        options,
      };
    } catch (error) {
      if (error instanceof AppError && error.code === "UNSUPPORTED_PLATFORM") {
        throw error;
      }
      if (error instanceof AppError && error.code === "INVALID_MEDIA_URL") {
        throw error;
      }
      throw safeProviderError("analysis");
    }
  }

  async download(request: MediaDownloadRequest): Promise<DownloadedMedia> {
    const validated = await this.dependencies.urlValidator.execute(request.url);
    if (!/^[a-z0-9._+-]{1,128}$/i.test(request.formatId)) {
      throw safeProviderError("download");
    }

    const outputDirectory = resolve(request.outputDirectory);
    try {
      const output = await this.run(
        this.dependencies.executablePath,
        [
          "--ignore-config",
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
          resolve(outputDirectory, "%(id)s.%(ext)s"),
          "--print",
          "after_move:filepath",
          validated.url,
        ],
        {
          cwd: outputDirectory,
          timeoutMs: processTimeoutMs,
          maxBufferBytes: maximumOutputBytes,
          env: providerEnvironment(outputDirectory, this.dependencies.proxyUrl?.()),
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