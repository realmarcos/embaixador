import { beforeEach, describe, expect, it, vi } from "vitest";
import { Download, UpdateDownloadInput } from "../../../repositories/downloads/types";
import { DownloadedMedia } from "../../../providers/media-extractor/types";
import { ProcessDownloadJobService } from "../process-download-job-service";

const processingDownload: Download = {
  id: "download-1",
  userId: "owner-1",
  platform: "YOUTUBE",
  sourceUrlCiphertext: "encrypted-source",
  sourceUrlIv: "source-iv",
  sourceUrlTag: "source-tag",
  sourceUrlKeyVersion: "v1",
  title: "Safe title",
  selectedFormatId: "format-720",
  selectedPresetId: null,
  targetContainer: "mp4",
  targetHeight: 720,
  targetWidth: null,
  targetAudioOnly: false,
  status: "PROCESSING",
  storageObjectKey: null,
  fileName: null,
  mimeType: null,
  sizeBytes: null,
  retentionHoursSnapshot: null,
  completedAt: null,
  expiresAt: null,
  failureCode: null,
  replayOfId: null,
  createdAt: new Date("2026-10-07T00:00:00.000Z"),
  updatedAt: new Date("2026-10-07T00:00:00.000Z"),
};

const downloadedMedia: DownloadedMedia = {
  filePath: "/tmp/job/media.mp4",
  fileName: "media.mp4",
  mimeType: "video/mp4",
  sizeBytes: 128,
};

describe("ProcessDownloadJobService", () => {
  const downloadRepository = { update: vi.fn() };
  const mediaExtractor = { download: vi.fn() };
  const mediaStorage = { putObject: vi.fn(), getObjectStream: vi.fn(), deleteObject: vi.fn() };
  const mediaConverter = { convert: vi.fn() };
  const decryptSourceUrl = vi.fn();
  const getRetentionHours = vi.fn();
  const createTemporaryDirectory = vi.fn();
  const removeTemporaryDirectory = vi.fn();
  const createObjectKey = vi.fn();
  const now = new Date("2026-10-07T12:00:00.000Z");
  const clock = vi.fn(() => now);
  let service: ProcessDownloadJobService;

  beforeEach(() => {
    vi.clearAllMocks();
    downloadRepository.update.mockImplementation((input: UpdateDownloadInput) =>
      Promise.resolve({ ...processingDownload, ...input }),
    );
    mediaExtractor.download.mockResolvedValue(downloadedMedia);
    mediaStorage.putObject.mockResolvedValue(undefined);
    mediaStorage.deleteObject.mockResolvedValue(undefined);
    mediaConverter.convert.mockResolvedValue(downloadedMedia);
    decryptSourceUrl.mockResolvedValue("https://www.youtube.com/watch?v=example");
    getRetentionHours.mockResolvedValue(8);
    createTemporaryDirectory.mockResolvedValue("/tmp/job-download-1");
    removeTemporaryDirectory.mockResolvedValue(undefined);
    createObjectKey.mockReturnValue("owner-1/random-object-key");
    service = new ProcessDownloadJobService({
      downloadRepository,
      mediaExtractor,
      mediaStorage,
      mediaConverter,
      decryptSourceUrl,
      getRetentionHours,
      createTemporaryDirectory,
      removeTemporaryDirectory,
      createObjectKey,
      clock,
    });
  });

  it("downloads, optionally converts, stores privately, and snapshots the owner's retention", async () => {
    const result = await service.execute(processingDownload);

    expect(decryptSourceUrl).toHaveBeenCalledWith({
      ciphertext: "encrypted-source",
      iv: "source-iv",
      tag: "source-tag",
      keyVersion: "v1",
    });
    expect(mediaExtractor.download).toHaveBeenCalledWith({
      url: "https://www.youtube.com/watch?v=example",
      formatId: "format-720",
      outputDirectory: "/tmp/job-download-1",
    });
    expect(mediaConverter.convert).toHaveBeenCalledOnce();
    expect(mediaConverter.convert).toHaveBeenCalledWith(expect.objectContaining({
      targetWidth: null,
      targetAudioOnly: false,
    }));
    expect(mediaStorage.putObject).toHaveBeenCalledWith({
      objectKey: "owner-1/random-object-key",
      filePath: downloadedMedia.filePath,
      mimeType: downloadedMedia.mimeType,
    });
    expect(result).toMatchObject({
      id: "download-1",
      status: "READY",
      storageObjectKey: "owner-1/random-object-key",
      retentionHoursSnapshot: 8,
      completedAt: now,
      expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
    });
    expect(removeTemporaryDirectory).toHaveBeenCalledWith("/tmp/job-download-1");
  });

  it("marks extraction failures with a safe code and removes temporary files", async () => {
    mediaExtractor.download.mockRejectedValueOnce(new Error("provider token=secret"));

    const result = await service.execute(processingDownload);

    expect(result).toMatchObject({ status: "FAILED", failureCode: "MEDIA_DOWNLOAD_FAILED" });
    expect(JSON.stringify(result)).not.toContain("provider token=secret");
    expect(removeTemporaryDirectory).toHaveBeenCalledWith("/tmp/job-download-1");
  });

  it("marks conversion failures safely and does not upload partial media", async () => {
    mediaConverter.convert.mockRejectedValueOnce(new Error("ffmpeg arguments contain private metadata"));

    const result = await service.execute(processingDownload);

    expect(result).toMatchObject({ status: "FAILED", failureCode: "MEDIA_CONVERSION_FAILED" });
    expect(mediaStorage.putObject).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private metadata");
    expect(removeTemporaryDirectory).toHaveBeenCalledWith("/tmp/job-download-1");
  });

  it("bypasses conversion for the original preset", async () => {
    const originalDownload = {
      ...processingDownload,
      selectedPresetId: "original",
      targetContainer: null,
      targetHeight: null,
      targetWidth: null,
      targetAudioOnly: false,
    };

    await service.execute(originalDownload);

    expect(mediaConverter.convert).not.toHaveBeenCalled();
    expect(mediaStorage.putObject).toHaveBeenCalledWith(expect.objectContaining({
      filePath: downloadedMedia.filePath,
      mimeType: downloadedMedia.mimeType,
    }));
  });

  it("marks storage failures safely without publishing an object key", async () => {
    mediaStorage.putObject.mockRejectedValueOnce(new Error("s3 secret-key=private"));

    const result = await service.execute(processingDownload);

    expect(result).toMatchObject({ status: "FAILED", failureCode: "MEDIA_STORAGE_WRITE_FAILED" });
    expect(result.storageObjectKey).toBeNull();
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("rejects a download outside PROCESSING state", async () => {
    await expect(service.execute({ ...processingDownload, status: "READY" })).rejects.toMatchObject({
      code: "INVALID_DOWNLOAD_STATE",
      statusCode: 409,
    });
    expect(mediaExtractor.download).not.toHaveBeenCalled();
  });

  it("does not upload when the user's retention setting is unsupported", async () => {
    getRetentionHours.mockResolvedValueOnce(2);

    const result = await service.execute(processingDownload);

    expect(result).toMatchObject({ status: "FAILED", failureCode: "INVALID_RETENTION_SETTING" });
    expect(mediaStorage.putObject).not.toHaveBeenCalled();
  });
});