import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../errors/app-errors";
import { AnalyzeMediaService } from "../analyze-media-service";

describe("AnalyzeMediaService", () => {
  const urlValidator = { execute: vi.fn() };
  const mediaExtractor = { analyze: vi.fn(), download: vi.fn() };
  let service: AnalyzeMediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    urlValidator.execute.mockResolvedValue({
      url: "https://www.youtube.com/watch?v=video-id",
      platform: "YOUTUBE",
    });
    service = new AnalyzeMediaService({ urlValidator, mediaExtractor });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns only safe fields and options from an allowlisted source", async () => {
    mediaExtractor.analyze.mockResolvedValue({
      platform: "YOUTUBE",
      title: "  Public   video title  ",
      thumbnailUrl: "https://private-cdn.example/thumbnail?token=secret",
      options: [
        {
          id: "provider-muxed-720",
          container: "mp4",
          width: 1280,
          height: 720,
          qualityLabel: "720p",
          isOriginal: true,
          hasAudio: true,
          hasVideo: true,
          url: "https://private-cdn.example/media?token=secret",
        },
      ],
      rawProviderPayload: { cookies: "private-cookie" },
    });

    const result = await service.execute("https://www.youtube.com/watch?v=video-id");

    expect(result).toEqual({
      platform: "YOUTUBE",
      title: "Public video title",
      thumbnailUrl: null,
      options: [
        {
          id: "original",
          kind: "original",
          label: "Original",
          container: "mp4",
          width: 1280,
          height: 720,
          isOriginal: true,
        },
        {
          id: "audio-mp3",
          kind: "audio",
          label: "Áudio MP3",
          container: "mp3",
          width: null,
          height: null,
          isOriginal: false,
        },
        {
          id: "audio-mp4",
          kind: "audio",
          label: "Áudio MP4",
          container: "mp4",
          width: null,
          height: null,
          isOriginal: false,
        },
        {
          id: "video-240p",
          kind: "video",
          label: "Vídeo 240p",
          container: "mp4",
          width: null,
          height: 240,
          isOriginal: false,
        },
        {
          id: "video-360p",
          kind: "video",
          label: "Vídeo 360p",
          container: "mp4",
          width: null,
          height: 360,
          isOriginal: false,
        },
        {
          id: "video-480p",
          kind: "video",
          label: "Vídeo 480p",
          container: "mp4",
          width: null,
          height: 480,
          isOriginal: false,
        },
        {
          id: "video-720p",
          kind: "video",
          label: "Vídeo 720p",
          container: "mp4",
          width: null,
          height: 720,
          isOriginal: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("private-cdn");
    expect(JSON.stringify(result)).not.toContain("private-cookie");
    expect(JSON.stringify(result)).not.toContain("provider-muxed-720");
  });

  it("rejects extractor metadata for a platform different from the validated host", async () => {
    mediaExtractor.analyze.mockResolvedValue({
      platform: "FACEBOOK",
      title: "Video",
      thumbnailUrl: null,
      options: [],
    });

    await expect(service.execute("https://www.youtube.com/watch?v=video-id")).rejects.toMatchObject({
      code: "MEDIA_ANALYSIS_FAILED",
      statusCode: 502,
    });
  });

  it("maps provider errors to a safe message without leaking raw output", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mediaExtractor.analyze.mockRejectedValue(new Error("token=private-secret provider stack"));

    await expect(service.execute("https://www.youtube.com/watch?v=video-id")).rejects.toMatchObject({
      code: "MEDIA_ANALYSIS_FAILED",
      statusCode: 502,
      message: "Unable to analyze this media right now",
    });
    await expect(
      service.execute("https://www.youtube.com/watch?v=video-id"),
    ).rejects.not.toThrow("private-secret");
    expect(log).not.toHaveBeenCalled();
  });

  it("does not call the extractor when URL validation fails", async () => {
    urlValidator.execute.mockRejectedValue(
      new AppError({ message: "Invalid media URL", code: "INVALID_MEDIA_URL", statusCode: 400 }),
    );

    await expect(service.execute("http://127.0.0.1/private")).rejects.toMatchObject({
      code: "INVALID_MEDIA_URL",
      statusCode: 400,
    });
    expect(mediaExtractor.analyze).not.toHaveBeenCalled();
  });
});