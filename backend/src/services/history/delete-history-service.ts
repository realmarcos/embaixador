import { AppError } from "../../errors/app-errors";
import { MediaStorageProvider } from "../../providers/media-storage";
import { DownloadRepository } from "../../repositories/downloads";
import { HistoryRepository } from "../../repositories/history";

interface DeleteHistoryServiceDependencies {
  historyRepository: Pick<HistoryRepository, "findByIdForOwner" | "findAllForOwner" | "deleteByIdForOwner" | "deleteAllForOwner">;
  downloadRepository: Pick<DownloadRepository, "update">;
  mediaStorage: Pick<MediaStorageProvider, "deleteObject">;
}

interface DeleteOwnedHistoryInput {
  userId: string;
  downloadId: string;
}

function historyNotFound(): AppError {
  return new AppError({ message: "History item not found", code: "HISTORY_NOT_FOUND", statusCode: 404 });
}

function mediaDeletionFailed(): AppError {
  return new AppError({ message: "Unable to remove this media right now", code: "MEDIA_DELETE_FAILED", statusCode: 502 });
}

class DeleteHistoryService {
  constructor(private readonly dependencies: DeleteHistoryServiceDependencies) {}

  async deleteMedia({ userId, downloadId }: DeleteOwnedHistoryInput): Promise<void> {
    const download = await this.dependencies.historyRepository.findByIdForOwner(downloadId, userId);
    if (!download) {
      throw historyNotFound();
    }
    if (download.status === "QUEUED" || download.status === "PROCESSING") {
      throw new AppError({ message: "This download cannot be removed yet", code: "DOWNLOAD_NOT_READY", statusCode: 409 });
    }
    if (!download.storageObjectKey) {
      return;
    }

    try {
      await this.dependencies.mediaStorage.deleteObject(download.storageObjectKey);
    } catch {
      throw mediaDeletionFailed();
    }

    await this.dependencies.downloadRepository.update({
      id: download.id,
      status: "MEDIA_DELETED",
      storageObjectKey: null,
      failureCode: null,
    });
  }

  async deleteOne({ userId, downloadId }: DeleteOwnedHistoryInput): Promise<void> {
    const download = await this.dependencies.historyRepository.findByIdForOwner(downloadId, userId);
    if (!download) {
      throw historyNotFound();
    }
    await this.deleteRetainedObject(download.storageObjectKey);
    const deleted = await this.dependencies.historyRepository.deleteByIdForOwner(downloadId, userId);
    if (!deleted) {
      throw historyNotFound();
    }
  }

  async deleteAll(userId: string): Promise<void> {
    const downloads = await this.dependencies.historyRepository.findAllForOwner(userId);
    for (const download of downloads) {
      await this.deleteRetainedObject(download.storageObjectKey);
    }
    await this.dependencies.historyRepository.deleteAllForOwner(userId);
  }

  private async deleteRetainedObject(objectKey: string | null): Promise<void> {
    if (!objectKey) {
      return;
    }
    try {
      await this.dependencies.mediaStorage.deleteObject(objectKey);
    } catch {
      throw mediaDeletionFailed();
    }
  }
}

export { DeleteHistoryService };