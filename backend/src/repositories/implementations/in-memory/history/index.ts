import { InMemoryDownloadRepository } from "../downloads";
import { HistoryRepository } from "../../../history";
import { Download } from "../../../downloads/types";
import { HistoryPageQuery } from "../../../history/types";

function compareNewestFirst(left: Download, right: Download): number {
  const dateOrder = right.createdAt.getTime() - left.createdAt.getTime();
  return dateOrder !== 0 ? dateOrder : right.id.localeCompare(left.id);
}

class InMemoryHistoryRepository implements HistoryRepository {
  constructor(private readonly downloadRepository: InMemoryDownloadRepository) {}

  findPage({ userId, cursor, limit }: HistoryPageQuery): Promise<Download[]> {
    const items = this.downloadRepository.downloads
      .filter((download) => download.userId === userId)
      .filter((download) => !cursor ||
        download.createdAt.getTime() < cursor.createdAt.getTime() ||
        (download.createdAt.getTime() === cursor.createdAt.getTime() && download.id < cursor.id))
      .sort(compareNewestFirst)
      .slice(0, limit);
    return Promise.resolve(items.map((download) => ({ ...download })));
  }

  findByIdForOwner(id: string, userId: string): Promise<Download | null> {
    const download = this.downloadRepository.downloads.find((candidate) => candidate.id === id && candidate.userId === userId);
    return Promise.resolve(download ? { ...download } : null);
  }

  findAllForOwner(userId: string): Promise<Download[]> {
    const downloads = this.downloadRepository.downloads
      .filter((download) => download.userId === userId)
      .sort(compareNewestFirst);
    return Promise.resolve(downloads.map((download) => ({ ...download })));
  }

  deleteByIdForOwner(id: string, userId: string): Promise<boolean> {
    const index = this.downloadRepository.downloads.findIndex((download) => download.id === id && download.userId === userId);
    if (index < 0) {
      return Promise.resolve(false);
    }
    this.downloadRepository.downloads.splice(index, 1);
    return Promise.resolve(true);
  }

  deleteAllForOwner(userId: string): Promise<void> {
    this.downloadRepository.downloads = this.downloadRepository.downloads.filter((download) => download.userId !== userId);
    return Promise.resolve();
  }
}

export { InMemoryHistoryRepository };