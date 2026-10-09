import { describe, expect, it } from "vitest";
import { InMemoryMediaExtractor } from "../media-extractor";

const analysis = {
  platform: "YOUTUBE" as const,
  title: "Test media",
  thumbnailUrl: null,
  options: [{
    id: "format-1",
    container: "mp4",
    width: 640,
    height: 360,
    qualityLabel: "360p",
    isOriginal: true,
  }],
};
const downloadedMedia = {
  filePath: "/tmp/media.mp4",
  fileName: "media.mp4",
  mimeType: "video/mp4",
  sizeBytes: 128,
};

describe("InMemoryMediaExtractor", () => {
  it("returns independent copies of configured analyses and downloads", async () => {
    const extractor = new InMemoryMediaExtractor(
      [{ url: "https://youtube.com/video", result: analysis }],
      [{ url: "https://youtube.com/video", formatId: "format-1", outputDirectory: "/tmp", result: downloadedMedia }],
    );

    const firstAnalysis = await extractor.analyze("https://youtube.com/video");
    const firstOption = firstAnalysis.options[0];
    if (!firstOption) throw new Error("Expected a configured media option");
    firstOption.id = "mutated";
    await expect(extractor.analyze("https://youtube.com/video")).resolves.toEqual(analysis);

    const firstDownload = await extractor.download({
      url: "https://youtube.com/video",
      formatId: "format-1",
      outputDirectory: "/tmp",
    });
    firstDownload.fileName = "mutated.mp4";
    await expect(extractor.download({
      url: "https://youtube.com/video",
      formatId: "format-1",
      outputDirectory: "/tmp",
    })).resolves.toEqual(downloadedMedia);
  });

  it("rejects when the requested URL or format has no configured result", async () => {
    const extractor = new InMemoryMediaExtractor();

    await expect(extractor.analyze("https://youtube.com/missing")).rejects.toThrow("No in-memory media analysis");
    await expect(extractor.download({
      url: "https://youtube.com/missing",
      formatId: "format-1",
      outputDirectory: "/tmp",
    })).rejects.toThrow("No in-memory media download");
  });
});