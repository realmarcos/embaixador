import { describe, expect, it } from "vitest";
import { AppError } from "../../../errors/app-errors";
import { ValidateMediaUrlService } from "../validate-media-url-service";

describe("ValidateMediaUrlService", () => {
  const service = new ValidateMediaUrlService();

  it.each([
    ["https://www.youtube.com/watch?v=video-id", "YOUTUBE"],
    ["https://youtu.be/video-id", "YOUTUBE"],
    ["https://www.instagram.com/reel/media-id/", "INSTAGRAM"],
    ["https://www.facebook.com/watch/?v=video-id", "FACEBOOK"],
    ["https://fb.watch/video-id/", "FACEBOOK"],
  ] as const)("recognizes supported URL %s", async (url, platform) => {
    await expect(service.execute(url)).resolves.toMatchObject({ platform, url });
  });

  it.each([
    "not a URL",
    "file://youtube.com/video",
    "ftp://youtube.com/video",
    "https://youtube.com.evil.example/video",
    "https://evil-youtube.com/video",
    "https://user:password@youtube.com/video",
    "http://127.0.0.1/video",
    "http://10.0.0.1/video",
    "http://[::1]/video",
    "https://youtube.com:8443/video",
  ])("rejects unsafe or unsupported URL %s", async (url) => {
    await expect(service.execute(url)).rejects.toBeInstanceOf(AppError);
  });

  it("rejects URLs longer than the documented maximum", async () => {
    const url = `https://youtube.com/${"a".repeat(2048)}`;

    await expect(service.execute(url)).rejects.toMatchObject({
      code: "INVALID_MEDIA_URL",
      statusCode: 400,
    });
  });

  it("rejects empty, private, or failed DNS answers when resolution is enabled", async () => {
    const noAnswers = new ValidateMediaUrlService({ resolveAddresses: () => Promise.resolve([]) });
    const privateAddress = new ValidateMediaUrlService({ resolveAddresses: () => Promise.resolve(["127.0.0.1"]) });
    const failedResolution = new ValidateMediaUrlService({
      resolveAddresses: () => Promise.reject(new Error("private DNS failure")),
    });

    for (const validator of [noAnswers, privateAddress, failedResolution]) {
      await expect(validator.execute("https://www.youtube.com/watch?v=example"))
        .rejects.toMatchObject({ code: "INVALID_MEDIA_URL", statusCode: 400 });
    }
  });
});