import type { PrismaClient } from "@prisma/client";
import { MediaStorageProvider } from "../../providers/media-storage";
import { PrismaDownloadRepository } from "../../repositories/implementations/prisma/downloads";
import { PrismaHistoryRepository } from "../../repositories/implementations/prisma/history";
import { createSourceUrlDecryptor } from "../../services/downloads/source-url-encryptor";
import { CreateDownloadService } from "../../services/downloads/create-download-service";
import { DeleteHistoryService } from "../../services/history/delete-history-service";
import { ListHistoryService } from "../../services/history/list-history-service";
import { RedownloadFromHistoryService } from "../../services/history/redownload-from-history-service";

interface CreateHistoryServiceFactoryInput {
  prisma: PrismaClient;
  mediaStorage: Pick<MediaStorageProvider, "deleteObject">;
  createDownloadService: Pick<CreateDownloadService, "execute">;
  sourceUrlEncryptionKey: string;
}

function createHistoryServiceFactory({
  prisma,
  mediaStorage,
  createDownloadService,
  sourceUrlEncryptionKey,
}: CreateHistoryServiceFactoryInput) {
  const historyRepository = new PrismaHistoryRepository(prisma);
  const downloadRepository = new PrismaDownloadRepository(prisma);
  return {
    historyRepository,
    listHistoryService: new ListHistoryService({ historyRepository }),
    deleteHistoryService: new DeleteHistoryService({ historyRepository, downloadRepository, mediaStorage }),
    redownloadService: new RedownloadFromHistoryService({
      historyRepository,
      createDownloadService,
      decryptSourceUrl: createSourceUrlDecryptor(sourceUrlEncryptionKey),
    }),
  };
}

export { createHistoryServiceFactory };