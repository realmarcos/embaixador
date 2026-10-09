import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryDownloadRepository } from "../index";
import { CreateDownloadInput, Download } from "../../../../downloads/types";

const time = new Date("2026-10-08T12:00:00.000Z");

function createRecord(overrides: Partial<Download> = {}): Download {
  return {
    id: "download-1",
    userId: "owner-1",
    platform: "YOUTUBE",
    sourceUrlCiphertext: "ciphertext",
    sourceUrlIv: "iv",
    sourceUrlTag: "tag",
    sourceUrlKeyVersion: "v1",
    title: "Title",
    selectedFormatId: "format-1",
    selectedPresetId: null,
    targetContainer: null,
    targetHeight: null,
    targetWidth: null,
    targetAudioOnly: false,
    status: "READY",
    storageObjectKey: "media/object-1",
    fileName: "media.mp4",
    mimeType: "video/mp4",
    sizeBytes: BigInt(10),
    retentionHoursSnapshot: 1,
    completedAt: time,
    expiresAt: new Date(time.getTime() + 3600000),
    failureCode: null,
    replayOfId: null,
    createdAt: time,
    updatedAt: time,
    ...overrides,
  };
}

const queuedInput: CreateDownloadInput = {
  userId: "owner-1",
  platform: "YOUTUBE",
  sourceUrlCiphertext: "ciphertext",
  sourceUrlIv: "iv",
  sourceUrlTag: "tag",
  sourceUrlKeyVersion: "v1",
  selectedFormatId: "format-1",
};

describe("InMemoryDownloadRepository", () => {
  let repository: InMemoryDownloadRepository;

  beforeEach(() => {
    repository = new InMemoryDownloadRepository();
  });

  it("creates queued rows with nullable defaults and an optional replay reference", async () => {
    const normal = await repository.createQueued(queuedInput);
    const replay = await repository.createQueued({
      ...queuedInput,
      targetContainer: "webm",
      targetHeight: 720,
      replayOfId: "download-original",
    });

    expect(normal).toMatchObject({
      status: "QUEUED",
      targetContainer: null,
      targetHeight: null,
      storageObjectKey: null,
      sizeBytes: null,
      retentionHoursSnapshot: null,
      completedAt: null,
      expiresAt: null,
      replayOfId: null,
    });
    expect(replay).toMatchObject({ targetContainer: "webm", targetHeight: 720, replayOfId: "download-original" });
    expect(normal.id).not.toBe(replay.id);
  });

  it("claims one queued row and then returns null when no queued row remains", async () => {
    await repository.createQueued(queuedInput);

    await expect(repository.claimNextQueued()).resolves.toMatchObject({ status: "PROCESSING" });
    await expect(repository.claimNextQueued()).resolves.toBeNull();
  });

  it("returns only expired READY or retryable DELETE_FAILED rows with an object key", async () => {
    repository = new InMemoryDownloadRepository([
      createRecord({ id: "future", expiresAt: new Date(time.getTime() + 1) }),
      createRecord({ id: "processing", status: "PROCESSING", expiresAt: time }),
      createRecord({ id: "ready", expiresAt: time }),
      createRecord({ id: "retryable", status: "DELETE_FAILED", expiresAt: time }),
      createRecord({ id: "missing-object", status: "DELETE_FAILED", storageObjectKey: null, expiresAt: time }),
    ]);

    await expect(repository.findExpiredForCleanup(time, 10)).resolves.toMatchObject([
      { id: "ready" },
      { id: "retryable" },
    ]);
    await expect(repository.findExpiredForCleanup(time, 1)).resolves.toMatchObject([{ id: "ready" }]);
  });

  it("owner-scopes lookup and returns null for a different owner or unknown row", async () => {
    repository = new InMemoryDownloadRepository([createRecord()]);

    await expect(repository.findByIdForOwner("download-1", "owner-1")).resolves.toMatchObject({ id: "download-1" });
    await expect(repository.findByIdForOwner("download-1", "other-owner")).resolves.toBeNull();
    await expect(repository.findByIdForOwner("missing", "owner-1")).resolves.toBeNull();
  });

  it("keeps omitted values during partial update and applies explicit nulls", async () => {
    repository = new InMemoryDownloadRepository([createRecord()]);

    await expect(repository.update({ id: "download-1", status: "FAILED", failureCode: "SAFE_FAILURE" }))
      .resolves.toMatchObject({
        title: "Title",
        storageObjectKey: "media/object-1",
        fileName: "media.mp4",
        mimeType: "video/mp4",
        sizeBytes: BigInt(10),
        retentionHoursSnapshot: 1,
        completedAt: time,
        expiresAt: new Date(time.getTime() + 3600000),
        failureCode: "SAFE_FAILURE",
      });
    await expect(repository.update({
      id: "download-1",
      status: "MEDIA_DELETED",
      title: null,
      storageObjectKey: null,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      retentionHoursSnapshot: null,
      completedAt: null,
      expiresAt: null,
      failureCode: null,
    })).resolves.toMatchObject({ title: null, storageObjectKey: null, fileName: null, expiresAt: null, failureCode: null });
  });

  it("rejects updates for missing rows with a safe domain error", () => {
    expect(() => repository.update({ id: "missing", status: "FAILED" })).toThrow(expect.objectContaining({
      code: "DOWNLOAD_NOT_FOUND",
      statusCode: 404,
    }));
  });
});