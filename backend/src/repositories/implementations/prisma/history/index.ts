import { PrismaClient } from "@prisma/client";
import { Download } from "../../../downloads/types";
import { HistoryRepository } from "../../../history";
import { HistoryPageQuery } from "../../../history/types";
import { toDomainDownload } from "../downloads";

class PrismaHistoryRepository implements HistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage({ userId, cursor, limit }: HistoryPageQuery): Promise<Download[]> {
    const downloads = await this.prisma.download.findMany({
      where: {
        userId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return downloads.map(toDomainDownload);
  }

  async findByIdForOwner(id: string, userId: string): Promise<Download | null> {
    const download = await this.prisma.download.findFirst({ where: { id, userId } });
    return download ? toDomainDownload(download) : null;
  }

  async findAllForOwner(userId: string): Promise<Download[]> {
    const downloads = await this.prisma.download.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return downloads.map(toDomainDownload);
  }

  async deleteByIdForOwner(id: string, userId: string): Promise<boolean> {
    const result = await this.prisma.download.deleteMany({ where: { id, userId } });
    return result.count === 1;
  }

  async deleteAllForOwner(userId: string): Promise<void> {
    await this.prisma.download.deleteMany({ where: { userId } });
  }
}

export { PrismaHistoryRepository };