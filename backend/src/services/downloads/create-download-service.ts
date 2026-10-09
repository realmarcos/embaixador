import { AppError } from "../../errors/app-errors";
import { DownloadRepository } from "../../repositories/downloads";
import { CreateDownloadInput, Download } from "../../repositories/downloads/types";
import { AnalyzeMediaService } from "./analyze-media-service";
import { ValidateMediaUrlService } from "./validate-media-url-service";
import { EncryptedSourceUrl } from "./source-url-encryptor";

interface CreateDownloadServiceInput {
  userId: string;
  sourceUrl: string;
  presetId?: string;
  legacyFormatId?: string;
  legacyTargetContainer?: string | null;
  legacyTargetHeight?: number | null;
  replayOfId?: string;
}

interface CreateDownloadServiceDependencies {
  downloadRepository: Pick<DownloadRepository, "createQueued">;
  urlValidator: Pick<ValidateMediaUrlService, "execute">;
  analyzeMediaService: Pick<AnalyzeMediaService, "executeWithCatalog">;
  encryptSourceUrl: (sourceUrl: string) => EncryptedSourceUrl;
}

function formatUnavailableError(): AppError {
  return new AppError({
    message: "The selected media format is no longer available",
    code: "FORMAT_NOT_AVAILABLE",
    statusCode: 422,
  });
}

class CreateDownloadService {
  constructor(private readonly dependencies: CreateDownloadServiceDependencies) {}

  async execute(input: CreateDownloadServiceInput): Promise<Download> {
    const validatedUrl = await this.dependencies.urlValidator.execute(input.sourceUrl);
    const { analysis, presets } = await this.dependencies.analyzeMediaService.executeWithCatalog(validatedUrl.url);
    const preset = input.presetId
      ? presets.find((candidate) => candidate.id === input.presetId)
      : input.legacyFormatId
        ? presets.find((candidate) =>
          candidate.sourceFormatId === input.legacyFormatId &&
          candidate.targetContainer === input.legacyTargetContainer &&
          candidate.targetHeight === input.legacyTargetHeight)
        : undefined;

    if (!preset) {
      throw formatUnavailableError();
    }

    const encryptedSourceUrl = this.dependencies.encryptSourceUrl(validatedUrl.url);
    const repositoryInput: CreateDownloadInput = {
      userId: input.userId,
      platform: analysis.platform,
      sourceUrlCiphertext: encryptedSourceUrl.ciphertext,
      sourceUrlIv: encryptedSourceUrl.iv,
      sourceUrlTag: encryptedSourceUrl.tag,
      sourceUrlKeyVersion: encryptedSourceUrl.keyVersion,
      selectedPresetId: preset.id,
      selectedFormatId: preset.sourceFormatId,
      targetContainer: preset.targetContainer,
      targetHeight: preset.targetHeight,
      targetWidth: preset.targetWidth,
      targetAudioOnly: preset.targetAudioOnly,
      ...(input.replayOfId ? { replayOfId: input.replayOfId } : {}),
    };

    try {
      return await this.dependencies.downloadRepository.createQueued(repositoryInput);
    } catch {
      throw new AppError({
        message: "Unable to create this download right now",
        code: "DOWNLOAD_CREATION_FAILED",
        statusCode: 500,
      });
    }
  }
}

export { CreateDownloadService };