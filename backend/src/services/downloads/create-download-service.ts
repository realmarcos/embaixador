import { AppError } from "../../errors/app-errors";
import { DownloadRepository } from "../../repositories/downloads";
import { CreateDownloadInput, Download } from "../../repositories/downloads/types";
import { AnalyzeMediaService } from "./analyze-media-service";
import { ValidateMediaUrlService } from "./validate-media-url-service";
import { EncryptedSourceUrl } from "./source-url-encryptor";

interface CreateDownloadServiceInput {
  userId: string;
  sourceUrl: string;
  formatId: string;
  targetContainer?: string;
  targetHeight?: number;
  replayOfId?: string;
}

interface CreateDownloadServiceDependencies {
  downloadRepository: Pick<DownloadRepository, "createQueued">;
  urlValidator: Pick<ValidateMediaUrlService, "execute">;
  analyzeMediaService: Pick<AnalyzeMediaService, "execute">;
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
    const analysis = await this.dependencies.analyzeMediaService.execute(validatedUrl.url);
    const option = analysis.options.find((candidate) => candidate.id === input.formatId);

    if (
      !option ||
      (input.targetContainer !== undefined && option.container !== input.targetContainer.toLowerCase()) ||
      (input.targetHeight !== undefined && option.height !== input.targetHeight)
    ) {
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
      selectedFormatId: option.id,
      targetContainer: input.targetContainer,
      targetHeight: input.targetHeight,
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