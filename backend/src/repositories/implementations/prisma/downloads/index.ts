import { Prisma, PrismaClient } from "@prisma/client";
import { DownloadRepository } from "../../../downloads";
import { CreateDownloadInput, Download, UpdateDownloadInput } from "../../../downloads/types";

type PrismaDownload = Prisma.DownloadGetPayload<Record<string, never>>;

function toDomainDownload(download: PrismaDownload): Download {
  return {
    id: download.id,
    userId: download.userId,
    platform: download.platform,
    sourceUrlCiphertext: download.sourceUrlCiphertext,
    sourceUrlIv: download.sourceUrlIv,
    sourceUrlTag: download.sourceUrlTag,
    sourceUrlKeyVersion: download.sourceUrlKeyVersion,
    title: download.title,
    selectedFormatId: download.selectedFormatId,
    selectedPresetId: download.selectedPresetId,
    targetContainer: download.targetContainer,
    targetHeight: download.targetHeight,
    targetWidth: download.targetWidth,
    targetAudioOnly: download.targetAudioOnly,
    status: download.status,
    storageObjectKey: download.storageObjectKey,
    fileName: download.fileName,
    mimeType: download.mimeType,
    sizeBytes: download.sizeBytes,
    retentionHoursSnapshot: download.retentionHoursSnapshot,
    completedAt: download.completedAt,
    expiresAt: download.expiresAt,
    failureCode: download.failureCode,
    replayOfId: download.replayOfId,
    createdAt: download.createdAt,
    updatedAt: download.updatedAt,
  };
}

class PrismaDownloadRepository implements DownloadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createQueued(input: CreateDownloadInput): Promise<Download> {
    const download = await this.prisma.download.create({
      data: {
        userId: input.userId,
        platform: input.platform,
        sourceUrlCiphertext: input.sourceUrlCiphertext,
        sourceUrlIv: input.sourceUrlIv,
        sourceUrlTag: input.sourceUrlTag,
        sourceUrlKeyVersion: input.sourceUrlKeyVersion,
        selectedFormatId: input.selectedFormatId,
        selectedPresetId: input.selectedPresetId,
        targetContainer: input.targetContainer,
        targetHeight: input.targetHeight,
        targetWidth: input.targetWidth,
        targetAudioOnly: input.targetAudioOnly,
        replayOfId: input.replayOfId,
        status: "QUEUED",
      },
    });

    return toDomainDownload(download);
  }

  async claimNextQueued(): Promise<Download | null> {
    const queued = await this.prisma.download.findFirst({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
    });
    if (!queued) {
      return null;
    }

    const claimed = await this.prisma.download.updateMany({
      where: { id: queued.id, status: "QUEUED" },
      data: { status: "PROCESSING" },
    });
    if (claimed.count !== 1) {
      return null;
    }

    const processing = await this.prisma.download.findUnique({ where: { id: queued.id } });
    return processing ? toDomainDownload(processing) : null;
  }

  async findExpiredForCleanup(now: Date, limit = 100): Promise<Download[]> {
    const downloads = await this.prisma.download.findMany({
      where: {
        expiresAt: { lte: now },
        OR: [
          { status: "READY" },
          { status: "DELETE_FAILED", storageObjectKey: { not: null } },
        ],
      },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });
    return downloads.map(toDomainDownload);
  }

  async findByIdForOwner(id: string, userId: string): Promise<Download | null> {
    const download = await this.prisma.download.findFirst({ where: { id, userId } });
    return download ? toDomainDownload(download) : null;
  }

  async update(input: UpdateDownloadInput): Promise<Download> {
    const { id, ...changes } = input;
    const download = await this.prisma.download.update({ where: { id }, data: changes });
    return toDomainDownload(download);
  }
}

export { PrismaDownloadRepository, toDomainDownload };