import { describe, expect, it } from "vitest";
import { MediaOption } from "../../../providers/media-extractor/types";
import { buildMediaFormatCatalog } from "../media-format-catalog";

function option(overrides: Partial<MediaOption> = {}): MediaOption {
  return {
    id: "muxed-720",
    container: "mp4",
    width: 1280,
    height: 720,
    qualityLabel: "720p",
    isOriginal: true,
    hasAudio: true,
    hasVideo: true,
    ...overrides,
  };
}

describe("buildMediaFormatCatalog", () => {
  it("returns the standard options supported by a 720p source without duplicates", () => {
    const presets = buildMediaFormatCatalog([
      option(),
      option({ id: "duplicate-720", container: "webm" }),
      option({ id: "audio-only", container: "m4a", width: null, height: null, hasVideo: false }),
    ]);

    expect(presets.map(({ id }) => id)).toEqual([
      "original",
      "audio-mp3",
      "audio-mp4",
      "video-240p",
      "video-360p",
      "video-480p",
      "video-720p",
    ]);
    expect(presets.filter(({ id }) => id === "video-720p")).toHaveLength(1);
    expect(presets.find(({ id }) => id === "video-720p")).toMatchObject({
      container: "mp4",
      width: null,
      height: 720,
      targetContainer: "mp4",
      targetHeight: 720,
      targetWidth: null,
      targetAudioOnly: false,
    });
  });

  it("does not offer video resolutions above the analyzed source height", () => {
    const presets = buildMediaFormatCatalog([option()]);
    expect(presets.map(({ id }) => id)).not.toContain("video-1080p");
    expect(presets.map(({ id }) => id)).not.toContain("video-2k-dci");
    expect(presets.map(({ id }) => id)).not.toContain("video-4k");
  });

  it("offers DCI 2K for a 1920x1080 picture using an exact padded output frame", () => {
    const presets = buildMediaFormatCatalog([option({ id: "full-hd", width: 1920, height: 1080 })]);
    expect(presets.find(({ id }) => id === "video-2k-dci")).toMatchObject({
      width: 2048,
      height: 1080,
      targetContainer: "mp4",
      targetWidth: 2048,
      targetHeight: 1080,
    });
  });

  it("omits audio presets when audio capability is absent or unknown", () => {
    const presets = buildMediaFormatCatalog([
      option({ id: "video-only", hasAudio: false }),
      option({ id: "unknown-codecs", hasAudio: undefined, hasVideo: undefined }),
    ]);
    expect(presets.map(({ id }) => id)).not.toContain("audio-mp3");
    expect(presets.map(({ id }) => id)).not.toContain("audio-mp4");
  });

  it("prefers muxed video or combines video with an audio-only source", () => {
    const muxed = buildMediaFormatCatalog([
      option({ id: "video-only", hasAudio: false }),
      option({ id: "muxed", hasAudio: true }),
    ]);
    expect(muxed.find(({ id }) => id === "video-720p")?.sourceFormatId).toBe("muxed");

    const separate = buildMediaFormatCatalog([
      option({ id: "video-only", hasAudio: false }),
      option({ id: "audio-only", container: "m4a", width: null, height: null, hasVideo: false }),
    ]);
    expect(separate.find(({ id }) => id === "video-720p")?.sourceFormatId).toBe("video-only+audio-only");
    expect(separate.map(({ id }) => id)).not.toContain("original");
  });

  it("does not offer a video resolution when source dimensions are unknown", () => {
    const presets = buildMediaFormatCatalog([option({ width: null, height: null })]);
    expect(presets.map(({ kind }) => kind)).toEqual(["original", "audio", "audio"]);
  });

  it("does not expose an original preset when no source option is available", () => {
    expect(buildMediaFormatCatalog([])).toEqual([]);
  });
});
