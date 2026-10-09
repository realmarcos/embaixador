import { randomUUID } from "node:crypto";
import { AppError } from "../../../../errors/app-errors";
import { DownloadRepository } from "../../../downloads";
import { CreateDownloadInput, Download, UpdateDownloadInput } from "../../../downloads/types";

class InMemoryDownloadRepository implements DownloadRepository {
  public downloads: Download[];

  constructor(initialDownloads: Download[] = []) {
    this.downloads = initialDownloads.map((download) => ({ ...download }));
  }

  createQueued(input: CreateDownloadInput): Promise<Download> {
    const now = new Date();
    const download: Download = {
      id: randomUUID(),
      userId: input.userId,
      platform: input.platform,
      sourceUrlCiphertext: input.sourceUrlCiphertext,
      sourceUrlIv: input.sourceUrlIv,
      sourceUrlTag: input.sourceUrlTag,
      sourceUrlKeyVersion: input.sourceUrlKeyVersion,
      title: null,
      selectedFormatId: input.selectedFormatId,
      selectedPresetId: input.selectedPresetId ?? null,
      targetContainer: input.targetContainer ?? null,
      targetHeight: input.targetHeight ?? null,
      targetWidth: input.targetWidth ?? null,
      targetAudioOnly: input.targetAudioOnly ?? false,
      status: "QUEUED",
      storageObjectKey: null,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      retentionHoursSnapshot: null,
      completedAt: null,
      expiresAt: null,
      failureCode: null,
      replayOfId: input.replayOfId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.downloads.unshift(download);
    return Promise.resolve({ ...download });
  }

  claimNextQueued(): Promise<Download | null> {
    const index = this.downloads.findIndex((download) => download.status === "QUEUED");
    const queued = this.downloads[index];
    if (!queued) {
      return Promise.resolve(null);
    }

    const processing: Download = { ...queued, status: "PROCESSING", updatedAt: new Date() };
    this.downloads[index] = processing;
    return Promise.resolve({ ...processing });
  }

  findExpiredForCleanup(now: Date, limit = 100): Promise<Download[]> {
    const expired = this.downloads
      .filter((download) =>
        (download.status === "READY" || download.status === "DELETE_FAILED") &&
        download.expiresAt !== null &&
        download.expiresAt.getTime() <= now.getTime() &&
        (download.status !== "DELETE_FAILED" || download.storageObjectKey !== null),
      )
      .sort((left, right) => (left.expiresAt?.getTime() ?? 0) - (right.expiresAt?.getTime() ?? 0))
      .slice(0, limit);
    return Promise.resolve(expired.map((download) => ({ ...download })));
  }

  findByIdForOwner(id: string, userId: string): Promise<Download | null> {
    const download = this.downloads.find((candidate) => candidate.id === id && candidate.userId === userId);
    return Promise.resolve(download ? { ...download } : null);
  }

  update(input: UpdateDownloadInput): Promise<Download> {
    const index = this.downloads.findIndex((candidate) => candidate.id === input.id);
    const existing = this.downloads[index];
    if (!existing) {
      throw new AppError({
        message: "Download not found",
        code: "DOWNLOAD_NOT_FOUND",
        statusCode: 404,
      });
    }

    const updated: Download = {
      ...existing,
      status: input.status,
      title: input.title === undefined ? existing.title : input.title,
      storageObjectKey: input.storageObjectKey === undefined ? existing.storageObjectKey : input.storageObjectKey,
      fileName: input.fileName === undefined ? existing.fileName : input.fileName,
      mimeType: input.mimeType === undefined ? existing.mimeType : input.mimeType,
      sizeBytes: input.sizeBytes === undefined ? existing.sizeBytes : input.sizeBytes,
      retentionHoursSnapshot: input.retentionHoursSnapshot === undefined
        ? existing.retentionHoursSnapshot
        : input.retentionHoursSnapshot,
      completedAt: input.completedAt === undefined ? existing.completedAt : input.completedAt,
      expiresAt: input.expiresAt === undefined ? existing.expiresAt : input.expiresAt,
      failureCode: input.failureCode === undefined ? existing.failureCode : input.failureCode,
      updatedAt: new Date(),
    };

    this.downloads[index] = updated;
    return Promise.resolve({ ...updated });
  }
}

export { InMemoryDownloadRepository };