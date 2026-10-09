import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryMediaStorage } from "../../../providers/implementations/in-memory/media-storage";
import { Download, UpdateDownloadInput } from "../../../repositories/downloads/types";
import { ExpireDownloadMediaService } from "../expire-download-media-service";

const currentTime = new Date("2026-10-07T12:00:00.000Z");
const readyDownload: Download = {
  id: "download-1",
  userId: "owner-1",
  platform: "YOUTUBE",
  sourceUrlCiphertext: "ciphertext",
  sourceUrlIv: "iv",
  sourceUrlTag: "tag",
  sourceUrlKeyVersion: "v1",
  title: "Private media",
  selectedFormatId: "format-720",
  selectedPresetId: null,
  targetContainer: null,
  targetHeight: null,
  targetWidth: null,
  targetAudioOnly: false,
  status: "READY",
  storageObjectKey: "media/object-1",
  fileName: "video.mp4",
  mimeType: "video/mp4",
  sizeBytes: BigInt(512),
  retentionHoursSnapshot: 1,
  completedAt: new Date("2026-10-07T11:00:00.000Z"),
  expiresAt: currentTime,
  failureCode: null,
  replayOfId: null,
  createdAt: new Date("2026-10-07T10:00:00.000Z"),
  updatedAt: new Date("2026-10-07T11:00:00.000Z"),
};

describe("ExpireDownloadMediaService", () => {
  const downloadRepository = { update: vi.fn() };
  const mediaStorage = new InMemoryMediaStorage();
  let service: ExpireDownloadMediaService;
  let temporaryDirectory: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    downloadRepository.update.mockImplementation((changes: UpdateDownloadInput) => Promise.resolve({ ...readyDownload, ...changes }));
    temporaryDirectory = await mkdtemp(join(tmpdir(), "expiry-test-"));
    const filePath = join(temporaryDirectory, "video.mp4");
    await writeFile(filePath, "private-media");
    await mediaStorage.putObject({ objectKey: "media/object-1", filePath, mimeType: "video/mp4" });
    service = new ExpireDownloadMediaService({
      downloadRepository,
      mediaStorage,
      clock: () => currentTime,
    });
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("does not expire a record before its deadline", async () => {
    const result = await service.execute({ ...readyDownload, expiresAt: new Date(currentTime.getTime() + 1) });

    expect(result).toBeNull();
    await expect(mediaStorage.getObjectStream("media/object-1")).resolves.toBeDefined();
    expect(downloadRepository.update).not.toHaveBeenCalled();
  });

  it("expires exactly at the deadline and keeps the owner history record", async () => {
    const result = await service.execute(readyDownload);

    await expect(mediaStorage.getObjectStream("media/object-1")).rejects.toMatchObject({ code: "MEDIA_OBJECT_NOT_FOUND" });
    expect(downloadRepository.update).toHaveBeenCalledWith({
      id: "download-1",
      status: "EXPIRED",
      storageObjectKey: null,
      failureCode: null,
    });
    expect(result).toMatchObject({ id: "download-1", userId: "owner-1", status: "EXPIRED" });
  });

  it("marks deletion failures for retry without removing the history record", async () => {
    const unavailableStorage = { deleteObject: vi.fn().mockRejectedValue(new Error("provider secret")) };
    const failureService = new ExpireDownloadMediaService({
      downloadRepository,
      mediaStorage: unavailableStorage,
      clock: () => currentTime,
    });

    const result = await failureService.execute(readyDownload);

    expect(downloadRepository.update).toHaveBeenCalledWith({
      id: "download-1",
      status: "DELETE_FAILED",
      storageObjectKey: "media/object-1",
      failureCode: "MEDIA_DELETE_FAILED",
    });
    expect(result).toMatchObject({ id: "download-1", userId: "owner-1", status: "DELETE_FAILED" });
  });

  it("retries expired records whose object deletion previously failed", async () => {
    const retryable = { ...readyDownload, status: "DELETE_FAILED" as const, failureCode: "MEDIA_DELETE_FAILED" };

    const result = await service.execute(retryable);

    await expect(mediaStorage.getObjectStream("media/object-1")).rejects.toMatchObject({ code: "MEDIA_OBJECT_NOT_FOUND" });
    expect(result).toMatchObject({ id: "download-1", status: "EXPIRED", storageObjectKey: null });
  });
});