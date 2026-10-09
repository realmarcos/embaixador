import { describe, expect, it } from "vitest";
import { InMemoryDownloadRepository } from "../../downloads";
import { InMemoryHistoryRepository } from "../index";
import { Download } from "../../../../downloads/types";

const timestamp = new Date("2026-10-08T12:00:00.000Z");

function download(id: string, userId: string, createdAt: Date): Download {
  return {
    id,
    userId,
    platform: "YOUTUBE",
    sourceUrlCiphertext: "ciphertext",
    sourceUrlIv: "iv",
    sourceUrlTag: "tag",
    sourceUrlKeyVersion: "v1",
    title: null,
    selectedFormatId: "format-1",
    selectedPresetId: null,
    targetContainer: null,
    targetHeight: null,
    targetWidth: null,
    targetAudioOnly: false,
    status: "READY",
    storageObjectKey: null,
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    retentionHoursSnapshot: 1,
    completedAt: null,
    expiresAt: null,
    failureCode: null,
    replayOfId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("InMemoryHistoryRepository", () => {
  it("orders by createdAt and ID, filters the composite cursor, and limits results", async () => {
    const downloads = new InMemoryDownloadRepository([
      download("id-a", "owner-1", timestamp),
      download("id-c", "owner-1", timestamp),
      download("id-b", "owner-1", timestamp),
      download("newer", "owner-1", new Date(timestamp.getTime() + 1000)),
      download("other", "owner-2", timestamp),
    ]);
    const repository = new InMemoryHistoryRepository(downloads);

    await expect(repository.findPage({ userId: "owner-1", cursor: null, limit: 3 }))
      .resolves.toMatchObject([{ id: "newer" }, { id: "id-c" }, { id: "id-b" }]);
    await expect(repository.findPage({
      userId: "owner-1",
      cursor: { createdAt: timestamp, id: "id-c" },
      limit: 10,
    })).resolves.toMatchObject([{ id: "id-b" }, { id: "id-a" }]);
  });

  it("returns only one owner's rows and handles missing lookups/deletes", async () => {
    const downloads = new InMemoryDownloadRepository([download("id-a", "owner-1", timestamp)]);
    const repository = new InMemoryHistoryRepository(downloads);

    await expect(repository.findByIdForOwner("id-a", "other-owner")).resolves.toBeNull();
    await expect(repository.findAllForOwner("other-owner")).resolves.toEqual([]);
    await expect(repository.deleteByIdForOwner("id-a", "other-owner")).resolves.toBe(false);
    await expect(repository.deleteByIdForOwner("id-a", "owner-1")).resolves.toBe(true);
    await expect(repository.deleteAllForOwner("owner-1")).resolves.toBeUndefined();
    expect(downloads.downloads).toEqual([]);
  });
});