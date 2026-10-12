import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { AppError } from "../../../errors/app-errors";
import { DownloadedMedia } from "../../../providers/media-extractor/types";
import {
  AudioEncoderCapabilities,
  MediaConversionInput,
  MediaConverterProvider,
} from "../../../providers/media-converter";

const execFileAsync = promisify(execFile);
const conversionTimeoutMs = 5 * 60 * 1000;
const encoderProbeTimeoutMs = 10 * 1000;
const maximumOutputBytes = 1024 * 1024;
const supportedContainers = new Set(["mp4", "webm", "mkv", "mov", "mp3", "m4a", "wav", "ogg", "opus"]);

interface CommandOptions {
  cwd: string;
  timeoutMs: number;
  maxBufferBytes: number;
  shell: false;
  env: NodeJS.ProcessEnv;
}

type CommandRunner = (executable: string, args: string[], options: CommandOptions) => Promise<void>;
type EncoderListingRunner = () => Promise<string>;

interface FfmpegMediaConverterDependencies {
  executablePath: string;
  run?: CommandRunner;
  inspectEncoders?: EncoderListingRunner;
}

function runProcess(executable: string, args: string[], options: CommandOptions): Promise<void> {
  return execFileAsync(executable, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    maxBuffer: options.maxBufferBytes,
    shell: options.shell,
    windowsHide: true,
    env: options.env,
  }).then(() => undefined);
}

function listEncoders(executablePath: string): Promise<string> {
  return execFileAsync(executablePath, ["-hide_banner", "-encoders"], {
    cwd: process.cwd(),
    timeout: encoderProbeTimeoutMs,
    maxBuffer: maximumOutputBytes,
    shell: false,
    windowsHide: true,
    env: { PATH: process.env.PATH ?? "" },
    encoding: "utf8",
  }).then(({ stdout }) => stdout);
}

function parseAudioEncoderCapabilities(output: string): AudioEncoderCapabilities {
  const names = new Set(output.split(/\r?\n/).flatMap((line) => {
    const fields = line.trim().split(/\s+/);
    return fields[0]?.startsWith("A") && fields[1] ? [fields[1]] : [];
  }));

  return {
    mp3: names.has("libmp3lame") || names.has("mp3"),
    mp4: names.has("aac") || names.has("libfdk_aac"),
  };
}

function mediaTypeFor(container: string): string {
  const mediaTypes: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/opus",
  };

  return mediaTypes[container] ?? "application/octet-stream";
}

function conversionError(): AppError {
  return new AppError({
    message: "Unable to convert this media right now",
    code: "MEDIA_CONVERSION_FAILED",
    statusCode: 502,
  });
}

function isPathInside(directory: string, filePath: string): boolean {
  const relativePath = relative(directory, filePath);
  return relativePath.length > 0 && relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

class FfmpegMediaConverter implements MediaConverterProvider {
  private readonly run: CommandRunner;
  private readonly inspectEncoders: EncoderListingRunner;
  private audioEncoderCapabilities: Promise<AudioEncoderCapabilities> | undefined;

  constructor(private readonly dependencies: FfmpegMediaConverterDependencies) {
    this.run = dependencies.run ?? runProcess;
    this.inspectEncoders = dependencies.inspectEncoders ?? (() => listEncoders(dependencies.executablePath));
  }

  getAudioEncoderCapabilities(): Promise<AudioEncoderCapabilities> {
    this.audioEncoderCapabilities ??= this.inspectEncoders()
      .then(parseAudioEncoderCapabilities)
      .catch(() => ({ mp3: false, mp4: false }));
    return this.audioEncoderCapabilities;
  }

  async convert(input: MediaConversionInput): Promise<DownloadedMedia> {
    const targetContainer = input.targetContainer.toLowerCase();
    if (!supportedContainers.has(targetContainer)) {
      throw new AppError({
        message: "The selected output format is not supported",
        code: "UNSUPPORTED_OUTPUT_FORMAT",
        statusCode: 422,
      });
    }

    const targetWidth = input.targetWidth ?? null;
    const targetHeight = input.targetHeight;
    if (
      (targetWidth !== null && (!Number.isInteger(targetWidth) || targetWidth < 1 || targetWidth > 8640)) ||
      (targetHeight !== null && (!Number.isInteger(targetHeight) || targetHeight < 1 || targetHeight > 8640)) ||
      (targetWidth !== null && targetHeight === null)
    ) {
      throw new AppError({
        message: "The selected output dimension is invalid",
        code: "INVALID_OUTPUT_DIMENSION",
        statusCode: 400,
      });
    }

    let outputDirectory: string;
    let inputPath: string;
    try {
      [outputDirectory, inputPath] = await Promise.all([
        realpath(input.outputDirectory),
        realpath(input.filePath),
      ]);
    } catch {
      throw new AppError({ message: "Invalid media path", code: "INVALID_MEDIA_PATH", statusCode: 400 });
    }

    if (!isPathInside(outputDirectory, inputPath)) {
      throw new AppError({ message: "Invalid media path", code: "INVALID_MEDIA_PATH", statusCode: 400 });
    }

    const outputFileName = `${randomUUID()}.${targetContainer}`;
    const outputPath = resolve(outputDirectory, outputFileName);
    const args = ["-nostdin", "-v", "error", "-y", "-i", inputPath];
    if (input.targetAudioOnly === true) {
      args.push("-vn");
    }
    if (targetWidth !== null && targetHeight !== null) {
      const fitFilter = [
        `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`,
      ].join(",");
      args.push("-vf", fitFilter);
    } else if (targetHeight !== null) {
      args.push("-vf", `scale=-2:${targetHeight}`);
    }
    args.push("-map_metadata", "-1", "-map_chapters", "-1", outputPath);

    try {
      await this.run(this.dependencies.executablePath, args, {
        cwd: outputDirectory,
        timeoutMs: conversionTimeoutMs,
        maxBufferBytes: maximumOutputBytes,
        shell: false,
        env: { PATH: process.env.PATH ?? "" },
      });

      const output = await stat(outputPath);
      if (!output.isFile() || output.size <= 0 || !isPathInside(outputDirectory, outputPath)) {
        throw conversionError();
      }

      return {
        filePath: outputPath,
        fileName: `${basename(input.fileName, extname(input.fileName))}.${targetContainer}`,
        mimeType: input.targetAudioOnly === true && targetContainer === "mp4"
          ? "audio/mp4"
          : mediaTypeFor(targetContainer),
        sizeBytes: output.size,
      };
    } catch {
      throw conversionError();
    }
  }
}

export { FfmpegMediaConverter };