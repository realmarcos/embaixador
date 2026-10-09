import type { PrismaClient } from "@prisma/client";
import { MediaExtractorProvider } from "../../providers/media-extractor";
import { PrismaDownloadRepository } from "../../repositories/implementations/prisma/downloads";
import { AnalyzeMediaService } from "../../services/downloads/analyze-media-service";
import { CreateDownloadService } from "../../services/downloads/create-download-service";
import { FindDownloadService } from "../../services/downloads/find-download-service";
import { createSourceUrlEncryptor } from "../../services/downloads/source-url-encryptor";
import { ValidateMediaUrlService } from "../../services/downloads/validate-media-url-service";

interface CreateDownloadServiceFactoryInput {
  prisma: PrismaClient;
  mediaExtractor: Pick<MediaExtractorProvider, "analyze" | "download">;
  sourceUrlEncryptionKey: string;
}

function createDownloadServiceFactory({
  prisma,
  mediaExtractor,
  sourceUrlEncryptionKey,
}: CreateDownloadServiceFactoryInput) {
  const downloadRepository = new PrismaDownloadRepository(prisma);
  const urlValidator = new ValidateMediaUrlService();
  const analyzeMediaService = new AnalyzeMediaService({ urlValidator, mediaExtractor });
  const createDownloadService = new CreateDownloadService({
    downloadRepository,
    urlValidator,
    analyzeMediaService,
    encryptSourceUrl: createSourceUrlEncryptor(sourceUrlEncryptionKey),
  });
  const findDownloadService = new FindDownloadService({ downloadRepository });

  return { analyzeMediaService, createDownloadService, findDownloadService, downloadRepository };
}

export { createDownloadServiceFactory };