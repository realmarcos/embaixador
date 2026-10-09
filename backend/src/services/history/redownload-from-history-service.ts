import { AppError } from "../../errors/app-errors";
import { CreateDownloadService } from "../downloads/create-download-service";
import { EncryptedSourceUrl } from "../downloads/source-url-encryptor";
import { HistoryRepository } from "../../repositories/history";

interface RedownloadFromHistoryServiceInput {
  userId: string;
  downloadId: string;
}

interface RedownloadFromHistoryServiceDependencies {
  historyRepository: Pick<HistoryRepository, "findByIdForOwner">;
  createDownloadService: Pick<CreateDownloadService, "execute">;
  decryptSourceUrl: (source: EncryptedSourceUrl) => string;
}

class RedownloadFromHistoryService {
  constructor(private readonly dependencies: RedownloadFromHistoryServiceDependencies) {}

  async execute({ userId, downloadId }: RedownloadFromHistoryServiceInput) {
    const sourceDownload = await this.dependencies.historyRepository.findByIdForOwner(downloadId, userId);
    if (!sourceDownload) {
      throw new AppError({ message: "History item not found", code: "HISTORY_NOT_FOUND", statusCode: 404 });
    }

    let sourceUrl: string;
    try {
      sourceUrl = this.dependencies.decryptSourceUrl({
        ciphertext: sourceDownload.sourceUrlCiphertext,
        iv: sourceDownload.sourceUrlIv,
        tag: sourceDownload.sourceUrlTag,
        keyVersion: sourceDownload.sourceUrlKeyVersion,
      });
    } catch {
      throw new AppError({ message: "This source cannot be downloaded again", code: "SOURCE_UNAVAILABLE", statusCode: 422 });
    }

    return this.dependencies.createDownloadService.execute({
      userId,
      sourceUrl,
      formatId: sourceDownload.selectedFormatId,
      ...(sourceDownload.targetContainer ? { targetContainer: sourceDownload.targetContainer } : {}),
      ...(sourceDownload.targetHeight !== null ? { targetHeight: sourceDownload.targetHeight } : {}),
      replayOfId: sourceDownload.id,
    });
  }
}

export { RedownloadFromHistoryService };