import { AppError } from "../../errors/app-errors";
import { DownloadRepository } from "../../repositories/downloads";
import { Download, UpdateDownloadInput } from "../../repositories/downloads/types";
import { MediaConverterProvider } from "../../providers/media-converter";
import { MediaStorageProvider } from "../../providers/media-storage";
import { MediaExtractorProvider } from "../../providers/media-extractor";
import { DownloadedMedia } from "../../providers/media-extractor/types";
import { EncryptedSourceUrl } from "./source-url-encryptor";

const allowedRetentionHours = [1, 8, 24, 72, 168, 336, 720];

interface ProcessDownloadJobDependencies {
  downloadRepository: Pick<DownloadRepository, "update">;
  mediaExtractor: Pick<MediaExtractorProvider, "download">;
  mediaStorage: Pick<MediaStorageProvider, "putObject" | "deleteObject">;
  mediaConverter: Pick<MediaConverterProvider, "convert">;
  decryptSourceUrl: (source: EncryptedSourceUrl) => string | Promise<string>;
  getRetentionHours: (userId: string) => Promise<number>;
  createTemporaryDirectory: () => Promise<string>;
  removeTemporaryDirectory: (directory: string) => Promise<void>;
  createObjectKey: () => string;
  clock: () => Date;
}

function isAllowedRetentionHours(value: number): boolean {
  return allowedRetentionHours.includes(value);
}

function safeFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "media";
  const sanitized = baseName
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .slice(0, 255);

  return sanitized.length > 0 ? sanitized : "media";
}

function safeFailureCode(error: unknown, fallback: string): string {
  if (
    error instanceof AppError &&
    [
      "MEDIA_DOWNLOAD_FAILED",
      "MEDIA_CONVERSION_FAILED",
      "MEDIA_STORAGE_WRITE_FAILED",
      "INVALID_RETENTION_SETTING",
    ].includes(error.code)
  ) {
    return error.code;
  }

  return fallback;
}

function failureCodeForState(download: Download): string {
  if (download.status === "PROCESSING") {
    return "SOURCE_URL_DECRYPTION_FAILED";
  }
  return "MEDIA_DOWNLOAD_FAILED";
}

class ProcessDownloadJobService {
  constructor(private readonly dependencies: ProcessDownloadJobDependencies) {}

  async execute(download: Download): Promise<Download> {
    if (download.status !== "PROCESSING") {
      throw new AppError({
        message: "Download is not ready for processing",
        code: "INVALID_DOWNLOAD_STATE",
        statusCode: 409,
      });
    }

    let temporaryDirectory: string | undefined;
    let objectKey: string | undefined;
    let failureCode = failureCodeForState(download);

    try {
      temporaryDirectory = await this.dependencies.createTemporaryDirectory();
      const sourceUrl = await this.dependencies.decryptSourceUrl({
        ciphertext: download.sourceUrlCiphertext,
        iv: download.sourceUrlIv,
        tag: download.sourceUrlTag,
        keyVersion: download.sourceUrlKeyVersion,
      });

      failureCode = "MEDIA_DOWNLOAD_FAILED";
      const extractedMedia = await this.dependencies.mediaExtractor.download({
        url: sourceUrl,
        formatId: download.selectedFormatId,
        outputDirectory: temporaryDirectory,
      });

      let completedMedia: DownloadedMedia = extractedMedia;
      if (
        download.targetContainer !== null ||
        download.targetHeight !== null ||
        download.targetWidth !== null ||
        download.targetAudioOnly
      ) {
        failureCode = "MEDIA_CONVERSION_FAILED";
        completedMedia = await this.dependencies.mediaConverter.convert({
          filePath: extractedMedia.filePath,
          fileName: extractedMedia.fileName,
          mimeType: extractedMedia.mimeType,
          targetContainer: download.targetContainer ?? extractedMedia.fileName.split(".").pop() ?? "bin",
          targetHeight: download.targetHeight,
          targetWidth: download.targetWidth,
          targetAudioOnly: download.targetAudioOnly,
          outputDirectory: temporaryDirectory,
        });
      }

      failureCode = "INVALID_RETENTION_SETTING";
      const retentionHours = await this.dependencies.getRetentionHours(download.userId);
      if (!isAllowedRetentionHours(retentionHours)) {
        throw new AppError({
          message: "The account retention setting is invalid",
          code: "INVALID_RETENTION_SETTING",
          statusCode: 500,
        });
      }

      objectKey = this.dependencies.createObjectKey();
      failureCode = "MEDIA_STORAGE_WRITE_FAILED";
      await this.dependencies.mediaStorage.putObject({
        objectKey,
        filePath: completedMedia.filePath,
        mimeType: completedMedia.mimeType,
      });

      failureCode = "DOWNLOAD_PERSISTENCE_FAILED";
      const completedAt = this.dependencies.clock();
      const readyUpdate: UpdateDownloadInput = {
        id: download.id,
        status: "READY",
        storageObjectKey: objectKey,
        fileName: safeFileName(completedMedia.fileName),
        mimeType: completedMedia.mimeType,
        sizeBytes: BigInt(completedMedia.sizeBytes),
        retentionHoursSnapshot: retentionHours,
        completedAt,
        expiresAt: new Date(completedAt.getTime() + retentionHours * 60 * 60 * 1000),
        failureCode: null,
      };
      const readyDownload = await this.dependencies.downloadRepository.update(readyUpdate);
      objectKey = undefined;
      return readyDownload;
    } catch (error) {
      let status: UpdateDownloadInput["status"] = "FAILED";
      let storageObjectKey: string | null = null;
      let safeCode = safeFailureCode(error, failureCode);

      if (objectKey) {
        try {
          await this.dependencies.mediaStorage.deleteObject(objectKey);
        } catch {
          status = "DELETE_FAILED";
          storageObjectKey = objectKey;
          safeCode = "MEDIA_DELETE_FAILED";
        }
      }

      try {
        return await this.dependencies.downloadRepository.update({
          id: download.id,
          status,
          storageObjectKey,
          failureCode: safeCode,
        });
      } catch {
        throw new AppError({
          message: "Unable to record this download result",
          code: "DOWNLOAD_PROCESSING_FAILED",
          statusCode: 500,
        });
      }
    } finally {
      if (temporaryDirectory) {
        try {
          await this.dependencies.removeTemporaryDirectory(temporaryDirectory);
        } catch {
          // Cleanup failures must not expose private paths or mask the job result.
        }
      }
    }
  }
}

export { ProcessDownloadJobService };
