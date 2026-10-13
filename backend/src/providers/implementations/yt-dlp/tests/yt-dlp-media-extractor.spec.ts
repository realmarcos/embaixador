import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ValidateMediaUrlService } from "../../../../services/downloads/validate-media-url-service";
import { YtDlpMediaExtractor } from "../yt-dlp-media-extractor";

interface RunnerOptions {
  cwd: string;
  timeoutMs: number;
  maxBufferBytes: number;
  env: NodeJS.ProcessEnv;
  shell: false;
}

type Runner = (executable: string, args: string[], options: RunnerOptions) => Promise<string>;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("YtDlpMediaExtractor", () => {
  it("runs analysis and download through the default execFile adapter", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "embaixador-ytdlp-process-test-"));
    temporaryDirectories.push(outputDirectory);
    const executablePath = join(outputDirectory, "fake-yt-dlp");
    await writeFile(executablePath, [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const args = process.argv.slice(2);",
      "if (args.includes('--dump-single-json')) {",
      "  const info = { extractor_key: 'Youtube', title: 'Local fixture', formats: [",
      "    { format_id: '18', ext: 'mp4', width: 640, height: 360, acodec: 'mp4a.40.2', vcodec: 'avc1.4d401e' },",
      "  ] };",
      "  process.stdout.write(JSON.stringify(info));",
      "} else {",
      "  const output = path.join(process.cwd(), 'local-video.mp4');",
      "  fs.writeFileSync(output, 'local process media');",
      "  process.stdout.write(output + '\\n');",
      "}",
      "",
    ].join("\n"));
    await chmod(executablePath, 0o755);
    const extractor = new YtDlpMediaExtractor({
      executablePath,
      urlValidator: new ValidateMediaUrlService(),
    });

    await expect(extractor.analyze("https://youtube.com/watch?v=fixture")).resolves.toMatchObject({
      platform: "YOUTUBE",
      title: "Local fixture",
      options: [{ id: "18", container: "mp4", hasAudio: true, hasVideo: true }],
    });
    await expect(extractor.download({
      url: "https://youtube.com/watch?v=fixture",
      formatId: "18",
      outputDirectory,
    })).resolves.toMatchObject({
      filePath: join(outputDirectory, "local-video.mp4"),
      fileName: "local-video.mp4",
      mimeType: "video/mp4",
    });
  });

  it("uses isolated structured analysis output and returns only safe metadata/options", async () => {
    const capturedCall: { executable: string; args: string[]; options?: RunnerOptions } = {
      executable: "",
      args: [],
    };
    const run = vi.fn<Runner>().mockImplementation((executable, args, options) => {
      capturedCall.executable = executable;
      capturedCall.args = args;
      capturedCall.options = options;
      return Promise.resolve(JSON.stringify({
        extractor_key: "Youtube",
        title: "Example video",
        thumbnail: "https://cdn.example/private?token=secret",
        formats: [
          {
            format_id: "18",
            ext: "mp4",
            width: 640,
            height: 360,
            format_note: "360p",
            acodec: "mp4a.40.2",
            vcodec: "avc1.4d401e",
            url: "https://cdn.example/private?token=secret",
          },
          { format_id: "22", ext: "mp4", width: 640, height: 360, acodec: "none", vcodec: "avc1.4d401e" },
          { format_id: "140", ext: "m4a", acodec: "mp4a.40.2", vcodec: "none" },
          { format_id: "unknown", ext: "mp4", width: 1280, height: 720 },
          { format_id: "unsafe id", ext: "mp4", width: 640, height: 360 },
        ],
        cookies: "private-cookie",
      }));
    });
    const extractor = new YtDlpMediaExtractor({
      executablePath: "/usr/bin/yt-dlp",
      urlValidator: new ValidateMediaUrlService(),
      proxyUrl: () => "http://127.0.0.1:43210",
      run,
    });

    const result = await extractor.analyze("https://www.youtube.com/watch?v=example");

    expect(result).toEqual({
      platform: "YOUTUBE",
      title: "Example video",
      thumbnailUrl: null,
      options: [
        {
          id: "18",
          container: "mp4",
          width: 640,
          height: 360,
          qualityLabel: "360p",
          isOriginal: true,
          hasAudio: true,
          hasVideo: true,
        },
        {
          id: "22",
          container: "mp4",
          width: 640,
          height: 360,
          qualityLabel: null,
          isOriginal: true,
          hasAudio: false,
          hasVideo: true,
        },
        {
          id: "140",
          container: "m4a",
          width: null,
          height: null,
          qualityLabel: null,
          isOriginal: true,
          hasAudio: true,
          hasVideo: false,
        },
        {
          id: "unknown",
          container: "mp4",
          width: 1280,
          height: 720,
          qualityLabel: null,
          isOriginal: true,
          hasAudio: false,
          hasVideo: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(capturedCall.executable).toBe("/usr/bin/yt-dlp");
    expect(capturedCall.args).toContain("--ignore-config");
    expect(capturedCall.args.filter((argument) => argument === "--proxy")).toHaveLength(1);
    expect(capturedCall.args[capturedCall.args.indexOf("--proxy") + 1]).toBe("http://127.0.0.1:43210");
    expect(capturedCall.args).toContain("--no-cookies");
    expect(capturedCall.args).toContain("--no-plugin-dirs");
    expect(capturedCall.options?.shell).toBe(false);
    expect(capturedCall.options?.timeoutMs).toBeGreaterThan(0);
    expect(capturedCall.options?.env.HTTPS_PROXY).toBe("http://127.0.0.1:43210");
    expect(capturedCall.options?.env.HTTP_PROXY).toBe("http://127.0.0.1:43210");
    expect(capturedCall.options?.env.NO_PROXY).toBe("");
  });

  it("uses the same local proxy in download arguments and environment, resolving it once", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "embaixador-ytdlp-proxy-"));
    temporaryDirectories.push(outputDirectory);
    const outputFile = join(outputDirectory, "video.mp4");
    const proxyUrl = vi.fn(() => "http://127.0.0.1:43210");
    const run = vi.fn<Runner>().mockImplementation(async (_executable, args, options) => {
      expect(args.filter((argument) => argument === "--proxy")).toHaveLength(1);
      expect(args[args.indexOf("--proxy") + 1]).toBe(proxyUrl.mock.results[0]?.value);
      expect(options.env.HTTP_PROXY).toBe("http://127.0.0.1:43210");
      expect(options.env.HTTPS_PROXY).toBe(options.env.HTTP_PROXY);
      expect(options.shell).toBe(false);
      await writeFile(outputFile, "media");
      return outputFile;
    });
    const extractor = new YtDlpMediaExtractor({
      executablePath: "/usr/bin/yt-dlp",
      urlValidator: new ValidateMediaUrlService(),
      proxyUrl,
      run,
    });
    await extractor.download({ url: "https://youtube.com/video", formatId: "18", outputDirectory });
    expect(proxyUrl).toHaveBeenCalledTimes(1);
  });

  it("maps malformed JSON, unsupported hosts, process errors, and timeouts to safe failures", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const run = vi.fn<Runner>().mockResolvedValue("human readable output token=secret");
    const extractor = new YtDlpMediaExtractor({
      executablePath: "/usr/bin/yt-dlp",
      urlValidator: new ValidateMediaUrlService(),
      run,
    });

    await expect(extractor.analyze("https://youtube.com/video")).rejects.toMatchObject({
      code: "MEDIA_ANALYSIS_FAILED",
      statusCode: 502,
    });
    await expect(extractor.analyze("https://unsupported.example/video")).rejects.toMatchObject({
      code: "UNSUPPORTED_PLATFORM",
      statusCode: 422,
    });

    run.mockRejectedValueOnce(new Error("timeout token=secret provider output"));
    await expect(extractor.analyze("https://youtube.com/video")).rejects.toMatchObject({
      code: "MEDIA_ANALYSIS_FAILED",
      message: "Unable to analyze this media right now",
    });
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    "[]",
    JSON.stringify({ extractor_key: "Other", formats: [{ format_id: "18", ext: "mp4" }] }),
    JSON.stringify({ extractor_key: "Youtube", formats: [] }),
    JSON.stringify({ extractor_key: "Youtube", formats: [{ format_id: "unsafe id", ext: "mp4" }] }),
  ])("rejects malformed structured provider payload %s", async (output) => {
    const extractor = new YtDlpMediaExtractor({
      executablePath: "/usr/bin/yt-dlp",
      urlValidator: new ValidateMediaUrlService(),
      run: vi.fn().mockResolvedValue(output),
    });

    await expect(extractor.analyze("https://youtube.com/video")).rejects.toMatchObject({
      code: "MEDIA_ANALYSIS_FAILED",
      statusCode: 502,
    });
  });

  it("downloads to the requested private directory and returns file metadata", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "embaixador-ytdlp-test-"));
    temporaryDirectories.push(outputDirectory);
    const outputFile = join(outputDirectory, "video.mp4");
    const run = vi.fn<Runner>().mockImplementation(async (_executable, args, options) => {
      expect(args).not.toContain("--proxy");
      expect(options.env.HTTP_PROXY).toBeUndefined();
      expect(args).toContain("--format=18");
      expect(args).toContain("--no-write-info-json");
      expect(args[args.indexOf("--output") + 1]).toBe(join(outputDirectory, "%(title)s.%(ext)s"));
      expect(options.cwd).toBe(outputDirectory);
      await writeFile(outputFile, "test-media-bytes");
      return `${outputFile}\n`;
    });
    const extractor = new YtDlpMediaExtractor({
      executablePath: "/usr/bin/yt-dlp",
      urlValidator: new ValidateMediaUrlService(),
      run,
    });

    await expect(
      extractor.download({
        url: "https://www.youtube.com/watch?v=example",
        formatId: "18",
        outputDirectory,
      }),
    ).resolves.toMatchObject({
      filePath: outputFile,
      fileName: "video.mp4",
      mimeType: "video/mp4",
      sizeBytes: 16,
    });
  });

  it("rejects unsafe format selectors and paths outside the private directory", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "embaixador-ytdlp-test-"));
    temporaryDirectories.push(outputDirectory);
    const run = vi.fn().mockResolvedValue("/tmp/outside.mp4\n");
    const extractor = new YtDlpMediaExtractor({
      executablePath: "/usr/bin/yt-dlp",
      urlValidator: new ValidateMediaUrlService(),
      run,
    });

    await expect(
      extractor.download({
        url: "https://www.youtube.com/watch?v=example",
        formatId: "18;touch /tmp/pwned",
        outputDirectory,
      }),
    ).rejects.toMatchObject({ code: "MEDIA_DOWNLOAD_FAILED", statusCode: 502 });
    expect(run).not.toHaveBeenCalled();
  });

  it("maps process errors and missing output paths to a safe download failure", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "embaixador-ytdlp-test-"));
    temporaryDirectories.push(outputDirectory);
    const run = vi.fn<Runner>().mockRejectedValueOnce(new Error("private URL and provider output"))
      .mockResolvedValueOnce("\n");
    const extractor = new YtDlpMediaExtractor({
      executablePath: "/usr/bin/yt-dlp",
      urlValidator: new ValidateMediaUrlService(),
      run,
    });
    const request = { url: "https://youtube.com/video", formatId: "18", outputDirectory };

    await expect(extractor.download(request)).rejects.toMatchObject({
      code: "MEDIA_DOWNLOAD_FAILED",
      statusCode: 502,
      message: "Unable to download this media right now",
    });
    await expect(extractor.download(request)).rejects.toMatchObject({ code: "MEDIA_DOWNLOAD_FAILED" });
  });

  it("rejects output directories and zero-byte files returned by the extractor", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "embaixador-ytdlp-test-"));
    temporaryDirectories.push(outputDirectory);
    const outputPath = join(outputDirectory, "empty.mp4");
    const run = vi.fn<Runner>().mockImplementation(async () => {
      await writeFile(outputPath, "");
      return `${outputPath}\n`;
    });
    const extractor = new YtDlpMediaExtractor({
      executablePath: "/usr/bin/yt-dlp",
      urlValidator: new ValidateMediaUrlService(),
      run,
    });
    const request = { url: "https://youtube.com/video", formatId: "18", outputDirectory };

    await expect(extractor.download(request)).rejects.toMatchObject({ code: "MEDIA_DOWNLOAD_FAILED" });
    await rm(outputPath);
    await mkdir(outputPath);
    await expect(extractor.download(request)).rejects.toMatchObject({ code: "MEDIA_DOWNLOAD_FAILED" });
  });
});