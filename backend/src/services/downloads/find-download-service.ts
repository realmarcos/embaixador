import { AppError } from "../../errors/app-errors";
import { DownloadRepository } from "../../repositories/downloads";
import { Download } from "../../repositories/downloads/types";

interface FindDownloadServiceInput {
  id: string;
  userId: string;
}

interface FindDownloadServiceDependencies {
  downloadRepository: Pick<DownloadRepository, "findByIdForOwner">;
}

class FindDownloadService {
  constructor(private readonly dependencies: FindDownloadServiceDependencies) {}

  async execute({ id, userId }: FindDownloadServiceInput): Promise<Download> {
    const download = await this.dependencies.downloadRepository.findByIdForOwner(id, userId);
    if (!download) {
      throw new AppError({
        message: "Download not found",
        code: "DOWNLOAD_NOT_FOUND",
        statusCode: 404,
      });
    }

    return download;
  }
}

export { FindDownloadService };