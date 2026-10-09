import { beforeEach, describe, expect, it, vi } from "vitest";
import { Download } from "../../repositories/downloads/types";
import { createDownloadCleanupWorker, createDownloadWorker } from "../download-worker";

const queuedDownload: Download = {
  id: "download-1",
  userId: "owner-1",
  platform: "YOUTUBE",
  sourceUrlCiphertext: "ciphertext",
  sourceUrlIv: "iv",
  sourceUrlTag: "tag",
  sourceUrlKeyVersion: "v1",
  title: null,
  selectedFormatId: "format-720",
  selectedPresetId: null,
  targetContainer: null,
  targetHeight: null,
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

describe("download worker", () => {
  const downloadRepository = { claimNextQueued: vi.fn() };
  const processDownloadJobService = { execute: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    processDownloadJobService.execute.mockResolvedValue(queuedDownload);
  });

  it("claims one queued job and passes it to the processor", async () => {
    downloadRepository.claimNextQueued.mockResolvedValueOnce(queuedDownload);
    const worker = createDownloadWorker({ downloadRepository, processDownloadJobService });

    await expect(worker.processNext()).resolves.toBe(true);
    expect(processDownloadJobService.execute).toHaveBeenCalledWith(queuedDownload);
  });

  it("returns idle when no queued job is available", async () => {
    downloadRepository.claimNextQueued.mockResolvedValueOnce(null);
    const worker = createDownloadWorker({ downloadRepository, processDownloadJobService });

    await expect(worker.processNext()).resolves.toBe(false);
    expect(processDownloadJobService.execute).not.toHaveBeenCalled();
  });

  it("continues after a processed job and stops when its AbortSignal is set", async () => {
    const controller = new AbortController();
    let claimCount = 0;
    downloadRepository.claimNextQueued.mockImplementation(() => {
      claimCount += 1;
      if (claimCount === 1) {
        return Promise.resolve(queuedDownload);
      }

      controller.abort();
      return Promise.resolve(null);
    });
    const worker = createDownloadWorker({ downloadRepository, processDownloadJobService, idlePollIntervalMs: 1 });

    await worker.run(controller.signal);

    expect(processDownloadJobService.execute).toHaveBeenCalledOnce();
    expect(claimCount).toBe(2);
  });

  it("does no work when the run signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const worker = createDownloadWorker({ downloadRepository, processDownloadJobService });

    await expect(worker.run(controller.signal)).resolves.toBeUndefined();
    expect(downloadRepository.claimNextQueued).not.toHaveBeenCalled();
  });

  it("stops an idle worker when cancellation occurs during its poll delay", async () => {
    const controller = new AbortController();
    downloadRepository.claimNextQueued.mockResolvedValue(null);
    const worker = createDownloadWorker({ downloadRepository, processDownloadJobService, idlePollIntervalMs: 1000 });
    const cancellation = setTimeout(() => {
      controller.abort();
    }, 5);

    await expect(worker.run(controller.signal)).resolves.toBeUndefined();
    clearTimeout(cancellation);
    expect(downloadRepository.claimNextQueued).toHaveBeenCalledOnce();
  });

  it("waits after a claim failure and exits when cancellation occurs during retry", async () => {
    const controller = new AbortController();
    let claims = 0;
    downloadRepository.claimNextQueued.mockImplementation(() => {
      claims += 1;
      if (claims === 1) return Promise.reject(new Error("temporary database error"));
      controller.abort();
      return Promise.resolve(null);
    });
    const worker = createDownloadWorker({ downloadRepository, processDownloadJobService, idlePollIntervalMs: 1 });

    await expect(worker.run(controller.signal)).resolves.toBeUndefined();
    expect(claims).toBe(2);
    expect(processDownloadJobService.execute).not.toHaveBeenCalled();
  });

  it("waits and retries cleanup after a transient storage or repository error", async () => {
    const controller = new AbortController();
    let claims = 0;
    const cleanupRepository = {
      findExpiredForCleanup: vi.fn().mockImplementation(() => {
        claims += 1;
        if (claims === 1) return Promise.reject(new Error("transient query error"));
        controller.abort();
        return Promise.resolve([]);
      }),
    };
    const expireDownloadMediaService = { execute: vi.fn() };
    const cleanupWorker = createDownloadCleanupWorker({
      downloadRepository: cleanupRepository,
      expireDownloadMediaService,
      idlePollIntervalMs: 1,
    });

    await expect(cleanupWorker.run(controller.signal)).resolves.toBeUndefined();
    expect(cleanupRepository.findExpiredForCleanup).toHaveBeenCalledTimes(2);
  });

  it("processes eligible expired records without filtering by account", async () => {
    const now = new Date("2026-10-07T12:00:00.000Z");
    const expired = {
      ...queuedDownload,
      status: "READY" as const,
      storageObjectKey: "media/object-1",
      expiresAt: new Date(now.getTime() - 1),
    };
    const cleanupRepository = { findExpiredForCleanup: vi.fn().mockResolvedValue([expired]) };
    const expireDownloadMediaService = { execute: vi.fn().mockResolvedValue({ ...expired, status: "EXPIRED" }) };
    const cleanupWorker = createDownloadCleanupWorker({
      downloadRepository: cleanupRepository,
      expireDownloadMediaService,
      clock: () => now,
    });

    await expect(cleanupWorker.processExpired()).resolves.toBe(1);
    expect(cleanupRepository.findExpiredForCleanup).toHaveBeenCalledWith(now);
    expect(expireDownloadMediaService.execute).toHaveBeenCalledWith(expired);
  });

  it("returns an empty cleanup count when there are no expired rows", async () => {
    const cleanupRepository = { findExpiredForCleanup: vi.fn().mockResolvedValue([]) };
    const expireDownloadMediaService = { execute: vi.fn() };
    const cleanupWorker = createDownloadCleanupWorker({ downloadRepository: cleanupRepository, expireDownloadMediaService });

    await expect(cleanupWorker.processExpired()).resolves.toBe(0);
    expect(expireDownloadMediaService.execute).not.toHaveBeenCalled();
  });
});