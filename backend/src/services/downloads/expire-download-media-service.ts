import { DownloadRepository } from "../../repositories/downloads";
import { Download } from "../../repositories/downloads/types";
import { MediaStorageProvider } from "../../providers/media-storage";

interface ExpireDownloadMediaServiceDependencies {
  downloadRepository: Pick<DownloadRepository, "update">;
  mediaStorage: Pick<MediaStorageProvider, "deleteObject">;
  clock: () => Date;
}

class ExpireDownloadMediaService {
  constructor(private readonly dependencies: ExpireDownloadMediaServiceDependencies) {}

  async execute(download: Download): Promise<Download | null> {
    if (
      (download.status !== "READY" && download.status !== "DELETE_FAILED") ||
      !download.expiresAt ||
      download.expiresAt.getTime() > this.dependencies.clock().getTime()
    ) {
      return null;
    }

    try {
      if (download.storageObjectKey) {
        await this.dependencies.mediaStorage.deleteObject(download.storageObjectKey);
      }
    } catch {
      return this.dependencies.downloadRepository.update({
        id: download.id,
        status: "DELETE_FAILED",
        storageObjectKey: download.storageObjectKey,
        failureCode: "MEDIA_DELETE_FAILED",
      });
    }

    return this.dependencies.downloadRepository.update({
      id: download.id,
      status: "EXPIRED",
      storageObjectKey: null,
      failureCode: null,
    });
  }
}

export { ExpireDownloadMediaService };