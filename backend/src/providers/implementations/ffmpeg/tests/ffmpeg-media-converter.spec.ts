import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FfmpegMediaConverter } from "../ffmpeg-media-converter";

interface RunnerOptions {
  cwd: string;
  timeoutMs: number;
  maxBufferBytes: number;
  shell: false;
}

type Runner = (executable: string, args: string[], options: RunnerOptions) => Promise<void>;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("FfmpegMediaConverter", () => {
  it("runs the default execFile adapter with an isolated executable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "embaixador-ffmpeg-process-test-"));
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "source.mp4");
    const executablePath = join(directory, "fake-ffmpeg");
    await writeFile(inputPath, "input bytes");
    await writeFile(executablePath, [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const outputPath = process.argv[process.argv.length - 1];",
      "if (typeof outputPath === 'string') fs.writeFileSync(outputPath, 'output bytes');",
      "",
    ].join("\n"));
    await chmod(executablePath, 0o755);

    const converter = new FfmpegMediaConverter({ executablePath });
    await expect(converter.convert({
      filePath: inputPath,
      fileName: "source.mp4",
      mimeType: "video/mp4",
      targetContainer: "mkv",
      targetHeight: null,
      outputDirectory: directory,
    })).resolves.toMatchObject({ mimeType: "video/x-matroska", sizeBytes: 12 });
  });

  it("converts within the private temp directory using no shell and bounded arguments", async () => {
    const directory = await mkdtemp(join(tmpdir(), "embaixador-ffmpeg-test-"));
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "source.webm");
    await writeFile(inputPath, "source-media-bytes");
    let capturedArgs: string[] = [];
    let capturedOptions: RunnerOptions | undefined;
    const run = vi.fn<Runner>().mockImplementation((executable, args, options) => {
      capturedArgs = args;
      capturedOptions = options;
      const outputPath = args[args.length - 1];
      if (!outputPath) {
        return Promise.reject(new Error("Missing FFmpeg output path"));
      }
      return writeFile(outputPath, "converted-media-bytes").then(() => undefined);
    });
    const converter = new FfmpegMediaConverter({ executablePath: "/usr/bin/ffmpeg", run });

    const result = await converter.convert({
      filePath: inputPath,
      fileName: "source.webm",
      mimeType: "video/webm",
      targetContainer: "mp4",
      targetHeight: 720,
      outputDirectory: directory,
    });

    expect(result.fileName).toMatch(/\.mp4$/);
    expect(result.mimeType).toBe("video/mp4");
    expect(result.sizeBytes).toBe(21);
    expect(capturedArgs).toContain("-nostdin");
    expect(capturedArgs).toContain("-y");
    expect(capturedArgs).toContain("scale=-2:720");
    expect(capturedOptions).toMatchObject({ cwd: directory, shell: false });
    expect(capturedOptions?.timeoutMs).toBeGreaterThan(0);
  });

  it("rejects unsupported containers and invalid dimensions before spawning FFmpeg", async () => {
    const run = vi.fn<Runner>().mockResolvedValue(undefined);
    const converter = new FfmpegMediaConverter({ executablePath: "/usr/bin/ffmpeg", run });

    await expect(
      converter.convert({
        filePath: "/tmp/source.webm",
        fileName: "source.webm",
        mimeType: "video/webm",
        targetContainer: "sh",
        targetHeight: 720,
        outputDirectory: "/tmp/job",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_OUTPUT_FORMAT", statusCode: 422 });
    await expect(
      converter.convert({
        filePath: "/tmp/job/source.webm",
        fileName: "source.webm",
        mimeType: "video/webm",
        targetContainer: "mp4",
        targetHeight: 10000,
        outputDirectory: "/tmp/job",
      }),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT_DIMENSION", statusCode: 400 });
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects source files outside the private temporary directory", async () => {
    const converter = new FfmpegMediaConverter({ executablePath: "/usr/bin/ffmpeg", run: vi.fn<Runner>() });

    await expect(
      converter.convert({
        filePath: "/etc/passwd",
        fileName: "source.webm",
        mimeType: "video/webm",
        targetContainer: "mp4",
        targetHeight: null,
        outputDirectory: "/tmp/job",
      }),
    ).rejects.toMatchObject({ code: "INVALID_MEDIA_PATH", statusCode: 400 });
  });

  it("supports remux without a resize filter and normalizes container casing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "embaixador-ffmpeg-test-"));
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "source.webm");
    await writeFile(inputPath, "source-media-bytes");
    const run = vi.fn<Runner>().mockImplementation((_executable, args) => {
      const outputPath = args[args.length - 1];
      if (!outputPath) return Promise.reject(new Error("missing output"));
      return writeFile(outputPath, "remuxed-bytes").then(() => undefined);
    });
    const converter = new FfmpegMediaConverter({ executablePath: "/usr/bin/ffmpeg", run });

    const result = await converter.convert({
      filePath: inputPath,
      fileName: "source.webm",
      mimeType: "video/webm",
      targetContainer: "MKV",
      targetHeight: null,
      outputDirectory: directory,
    });

    const args = run.mock.calls[0]?.[1] ?? [];
    expect(args).not.toContain("-vf");
    expect(result.mimeType).toBe("video/x-matroska");
    expect(result.fileName).toMatch(/\.mkv$/);
  });

  it("maps missing input paths and non-file outputs safely", async () => {
    const missingPathConverter = new FfmpegMediaConverter({ executablePath: "/usr/bin/ffmpeg", run: vi.fn<Runner>() });
    await expect(missingPathConverter.convert({
      filePath: "/missing/source.webm",
      fileName: "source.webm",
      mimeType: "video/webm",
      targetContainer: "mp4",
      targetHeight: null,
      outputDirectory: "/missing/job",
    })).rejects.toMatchObject({ code: "INVALID_MEDIA_PATH", statusCode: 400 });

    const directory = await mkdtemp(join(tmpdir(), "embaixador-ffmpeg-test-"));
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "source.webm");
    await writeFile(inputPath, "source-media-bytes");
    const run = vi.fn<Runner>().mockImplementation(async (_executable, args) => {
      const outputPath = args[args.length - 1];
      if (!outputPath) throw new Error("missing output");
      await mkdir(outputPath);
    });
    const converter = new FfmpegMediaConverter({ executablePath: "/usr/bin/ffmpeg", run });
    await expect(converter.convert({
      filePath: inputPath,
      fileName: "source.webm",
      mimeType: "video/webm",
      targetContainer: "mp4",
      targetHeight: null,
      outputDirectory: directory,
    })).rejects.toMatchObject({ code: "MEDIA_CONVERSION_FAILED", statusCode: 502 });
  });

  it("maps process errors and timeout output to a safe conversion error", async () => {
    const directory = await mkdtemp(join(tmpdir(), "embaixador-ffmpeg-test-"));
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "source.webm");
    await writeFile(inputPath, "source-media-bytes");
    const run = vi.fn<Runner>().mockRejectedValue(new Error("arguments contain private metadata"));
    const converter = new FfmpegMediaConverter({ executablePath: "/usr/bin/ffmpeg", run });

    await expect(
      converter.convert({
        filePath: inputPath,
        fileName: "source.webm",
        mimeType: "video/webm",
        targetContainer: "mp4",
        targetHeight: null,
        outputDirectory: directory,
      }),
    ).rejects.toMatchObject({
      code: "MEDIA_CONVERSION_FAILED",
      statusCode: 502,
      message: "Unable to convert this media right now",
    });
  });
});