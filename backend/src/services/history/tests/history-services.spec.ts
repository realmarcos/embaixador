import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryMediaStorage } from "../../../providers/implementations/in-memory/media-storage";
import { InMemoryDownloadRepository } from "../../../repositories/implementations/in-memory/downloads";
import { InMemoryHistoryRepository } from "../../../repositories/implementations/in-memory/history";
import { Download, UpdateDownloadInput } from "../../../repositories/downloads/types";
import { ListHistoryService } from "../list-history-service";
import { DeleteHistoryService } from "../delete-history-service";
import { RedownloadFromHistoryService } from "../redownload-from-history-service";

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
  expiresAt: new Date("2026-10-08T11:00:00.000Z"),
  failureCode: null,
  replayOfId: null,
  createdAt: new Date("2026-10-07T10:00:00.000Z"),
  updatedAt: new Date("2026-10-07T11:00:00.000Z"),
};

describe("history services", () => {
  const historyRepository = {
    findPage: vi.fn(),
    findByIdForOwner: vi.fn(),
    findAllForOwner: vi.fn(),
    deleteByIdForOwner: vi.fn(),
    deleteAllForOwner: vi.fn(),
  };
  const downloadRepository = { update: vi.fn() };
  const mediaStorage = { deleteObject: vi.fn() };
  const createDownloadService = { execute: vi.fn() };
  const decryptSourceUrl = vi.fn();
  let listHistoryService: ListHistoryService;
  let deleteHistoryService: DeleteHistoryService;
  let redownloadService: RedownloadFromHistoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    historyRepository.findPage.mockResolvedValue([readyDownload]);
    historyRepository.findByIdForOwner.mockResolvedValue(readyDownload);
    historyRepository.findAllForOwner.mockResolvedValue([readyDownload]);
    historyRepository.deleteByIdForOwner.mockResolvedValue(true);
    historyRepository.deleteAllForOwner.mockResolvedValue(undefined);
    downloadRepository.update.mockImplementation((update: UpdateDownloadInput): Promise<Download> =>
      Promise.resolve({ ...readyDownload, ...update }));
    mediaStorage.deleteObject.mockResolvedValue(undefined);
    decryptSourceUrl.mockReturnValue("https://www.youtube.com/watch?v=private-source");
    createDownloadService.execute.mockResolvedValue({ ...readyDownload, id: "download-2", status: "QUEUED" });

    listHistoryService = new ListHistoryService({ historyRepository });
    deleteHistoryService = new DeleteHistoryService({ historyRepository, downloadRepository, mediaStorage });
    redownloadService = new RedownloadFromHistoryService({ historyRepository, createDownloadService, decryptSourceUrl });
  });

  it("lists only the authenticated owner's page and returns a composite cursor", async () => {
    const secondRecord = { ...readyDownload, id: "download-2", createdAt: new Date("2026-10-06T10:00:00.000Z") };
    historyRepository.findPage.mockResolvedValueOnce([readyDownload, secondRecord]);

    const page = await listHistoryService.execute({ userId: "owner-1", limit: 1 });

    expect(historyRepository.findPage).toHaveBeenCalledWith({ userId: "owner-1", cursor: null, limit: 2 });
    expect(page.items).toEqual([readyDownload]);
    expect(page.nextCursor).toBe(Buffer.from(JSON.stringify({
      createdAt: readyDownload.createdAt.toISOString(),
      id: readyDownload.id,
    })).toString("base64url"));
  });

  it("rejects malformed cursors and out-of-range page sizes", async () => {
    await expect(listHistoryService.execute({ userId: "owner-1", cursor: "not-a-cursor" }))
      .rejects.toMatchObject({ code: "INVALID_HISTORY_QUERY", statusCode: 400 });
    await expect(listHistoryService.execute({
      userId: "owner-1",
      cursor: Buffer.from(JSON.stringify({ id: "", createdAt: "not-a-date" })).toString("base64url"),
    })).rejects.toMatchObject({ code: "INVALID_HISTORY_QUERY", statusCode: 400 });
    await expect(listHistoryService.execute({ userId: "owner-1", limit: 101 }))
      .rejects.toMatchObject({ code: "INVALID_HISTORY_QUERY", statusCode: 400 });
  });

  it.each([
    null,
    [],
    {},
    { id: "", createdAt: "2026-10-08T10:00:00.000Z" },
    { id: "download-1", createdAt: 123 },
    { id: "download-1", createdAt: "not-a-date" },
  ])("rejects decoded cursor values without a valid composite key: %j", async (value) => {
    const cursor = Buffer.from(JSON.stringify(value)).toString("base64url");
    await expect(listHistoryService.execute({ userId: "owner-1", cursor }))
      .rejects.toMatchObject({ code: "INVALID_HISTORY_QUERY", statusCode: 400 });
  });

  it("decodes a valid cursor and returns no next cursor for a final page", async () => {
    const cursorValue = Buffer.from(JSON.stringify({
      id: "download-previous",
      createdAt: readyDownload.createdAt.toISOString(),
    })).toString("base64url");

    await expect(listHistoryService.execute({ userId: "owner-1", cursor: cursorValue, limit: 20 }))
      .resolves.toMatchObject({ items: [readyDownload], nextCursor: null });
    expect(historyRepository.findPage).toHaveBeenCalledWith({
      userId: "owner-1",
      cursor: { id: "download-previous", createdAt: readyDownload.createdAt },
      limit: 21,
    });
  });

  it("deletes media but retains the history row", async () => {
    await deleteHistoryService.deleteMedia({ userId: "owner-1", downloadId: "download-1" });

    expect(historyRepository.findByIdForOwner).toHaveBeenCalledWith("download-1", "owner-1");
    expect(mediaStorage.deleteObject).toHaveBeenCalledWith("media/object-1");
    expect(downloadRepository.update).toHaveBeenCalledWith({
      id: "download-1",
      status: "MEDIA_DELETED",
      storageObjectKey: null,
      failureCode: null,
    });
    expect(historyRepository.deleteByIdForOwner).not.toHaveBeenCalled();
  });

  it("rejects missing or active media deletion and no-ops after media is already gone", async () => {
    historyRepository.findByIdForOwner.mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...readyDownload, status: "PROCESSING" })
      .mockResolvedValueOnce({ ...readyDownload, status: "MEDIA_DELETED", storageObjectKey: null });

    await expect(deleteHistoryService.deleteMedia({ userId: "owner-1", downloadId: "missing" }))
      .rejects.toMatchObject({ code: "HISTORY_NOT_FOUND", statusCode: 404 });
    await expect(deleteHistoryService.deleteMedia({ userId: "owner-1", downloadId: "download-1" }))
      .rejects.toMatchObject({ code: "DOWNLOAD_NOT_READY", statusCode: 409 });
    await expect(deleteHistoryService.deleteMedia({ userId: "owner-1", downloadId: "download-1" }))
      .resolves.toBeUndefined();
    expect(mediaStorage.deleteObject).not.toHaveBeenCalled();
  });

  it("does not delete history if an owned lookup or conditional row delete fails", async () => {
    historyRepository.findByIdForOwner.mockResolvedValueOnce(null).mockResolvedValueOnce(readyDownload);
    historyRepository.deleteByIdForOwner.mockResolvedValueOnce(false);

    await expect(deleteHistoryService.deleteOne({ userId: "owner-1", downloadId: "missing" }))
      .rejects.toMatchObject({ code: "HISTORY_NOT_FOUND", statusCode: 404 });
    await expect(deleteHistoryService.deleteOne({ userId: "owner-1", downloadId: "download-1" }))
      .rejects.toMatchObject({ code: "HISTORY_NOT_FOUND", statusCode: 404 });
  });

  it("deletes an owned history record only after its retained media is removed", async () => {
    await deleteHistoryService.deleteOne({ userId: "owner-1", downloadId: "download-1" });

    expect(mediaStorage.deleteObject).toHaveBeenCalledWith("media/object-1");
    expect(historyRepository.deleteByIdForOwner).toHaveBeenCalledWith("download-1", "owner-1");
  });

  it("removes history rows that no longer have a retained media object", async () => {
    historyRepository.findByIdForOwner.mockResolvedValueOnce({ ...readyDownload, storageObjectKey: null });
    historyRepository.findAllForOwner.mockResolvedValueOnce([{ ...readyDownload, storageObjectKey: null }]);

    await expect(deleteHistoryService.deleteOne({ userId: "owner-1", downloadId: "download-1" })).resolves.toBeUndefined();
    await expect(deleteHistoryService.deleteAll("owner-1")).resolves.toBeUndefined();
    expect(mediaStorage.deleteObject).not.toHaveBeenCalled();
    expect(historyRepository.deleteByIdForOwner).toHaveBeenCalledWith("download-1", "owner-1");
    expect(historyRepository.deleteAllForOwner).toHaveBeenCalledWith("owner-1");
  });

  it("deletes all owned media before deleting the owner's history", async () => {
    await deleteHistoryService.deleteAll("owner-1");

    expect(historyRepository.findAllForOwner).toHaveBeenCalledWith("owner-1");
    expect(mediaStorage.deleteObject).toHaveBeenCalledWith("media/object-1");
    expect(historyRepository.deleteAllForOwner).toHaveBeenCalledWith("owner-1");
  });

  it("preserves the record and returns a safe error when media deletion fails", async () => {
    mediaStorage.deleteObject.mockRejectedValueOnce(new Error("private provider details"));

    await expect(deleteHistoryService.deleteOne({ userId: "owner-1", downloadId: "download-1" }))
      .rejects.toMatchObject({ code: "MEDIA_DELETE_FAILED", statusCode: 502 });
    expect(historyRepository.deleteByIdForOwner).not.toHaveBeenCalled();
  });

  it("does not delete account history when any retained object deletion fails", async () => {
    mediaStorage.deleteObject.mockRejectedValueOnce(new Error("private S3 details"));

    await expect(deleteHistoryService.deleteAll("owner-1"))
      .rejects.toMatchObject({ code: "MEDIA_DELETE_FAILED", statusCode: 502 });
    expect(historyRepository.deleteAllForOwner).not.toHaveBeenCalled();
  });

  it("revalidates a source when re-downloading an owned history item", async () => {
    await expect(redownloadService.execute({ userId: "owner-1", downloadId: "download-1" }))
      .resolves.toMatchObject({ id: "download-2", status: "QUEUED" });

    expect(decryptSourceUrl).toHaveBeenCalledWith({
      ciphertext: "ciphertext",
      iv: "iv",
      tag: "tag",
      keyVersion: "v1",
    });
    expect(createDownloadService.execute).toHaveBeenCalledWith({
      userId: "owner-1",
      sourceUrl: "https://www.youtube.com/watch?v=private-source",
      legacyFormatId: "format-720",
      legacyTargetContainer: null,
      legacyTargetHeight: null,
      replayOfId: "download-1",
    });
  });

  it("rejects missing or undecryptable sources and forwards conversion targets", async () => {
    historyRepository.findByIdForOwner.mockResolvedValueOnce(null).mockResolvedValueOnce(readyDownload);
    decryptSourceUrl.mockImplementationOnce(() => { throw new Error("bad encryption key"); });

    await expect(redownloadService.execute({ userId: "owner-1", downloadId: "missing" }))
      .rejects.toMatchObject({ code: "HISTORY_NOT_FOUND", statusCode: 404 });
    await expect(redownloadService.execute({ userId: "owner-1", downloadId: "download-1" }))
      .rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", statusCode: 422 });

    historyRepository.findByIdForOwner.mockResolvedValueOnce({
      ...readyDownload,
      targetContainer: "webm",
      targetHeight: 720,
    });
    await redownloadService.execute({ userId: "owner-1", downloadId: "download-1" });
    expect(createDownloadService.execute).toHaveBeenLastCalledWith({
      userId: "owner-1",
      sourceUrl: "https://www.youtube.com/watch?v=private-source",
      legacyFormatId: "format-720",
      legacyTargetContainer: "webm",
      legacyTargetHeight: 720,
      replayOfId: "download-1",
    });
  });

  it("integrates with in-memory repositories and storage without crossing owners", async () => {
    const otherOwnerDownload = { ...readyDownload, id: "download-2", userId: "owner-2" };
    const downloads = new InMemoryDownloadRepository([readyDownload, otherOwnerDownload]);
    const memoryHistory = new InMemoryHistoryRepository(downloads);
    const memoryStorage = new InMemoryMediaStorage();
    const memoryListService = new ListHistoryService({ historyRepository: memoryHistory });
    const memoryDeleteService = new DeleteHistoryService({
      historyRepository: memoryHistory,
      downloadRepository: downloads,
      mediaStorage: memoryStorage,
    });

    await expect(memoryListService.execute({ userId: "owner-1" })).resolves.toMatchObject({
      items: [{ id: "download-1", userId: "owner-1" }],
      nextCursor: null,
    });
    await memoryDeleteService.deleteMedia({ userId: "owner-1", downloadId: "download-1" });
    await expect(memoryHistory.findByIdForOwner("download-1", "owner-1")).resolves.toMatchObject({
      status: "MEDIA_DELETED",
      storageObjectKey: null,
    });
    await memoryDeleteService.deleteAll("owner-1");
    await expect(memoryHistory.findByIdForOwner("download-1", "owner-1")).resolves.toBeNull();
    await expect(memoryHistory.findByIdForOwner("download-2", "owner-2")).resolves.toBeDefined();
  });
});