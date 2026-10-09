import { CreateDownloadInput, Download, UpdateDownloadInput } from "./types";

interface DownloadRepository {
  createQueued(input: CreateDownloadInput): Promise<Download>;
  claimNextQueued(): Promise<Download | null>;
  findExpiredForCleanup(now: Date, limit?: number): Promise<Download[]>;
  findByIdForOwner(id: string, userId: string): Promise<Download | null>;
  update(input: UpdateDownloadInput): Promise<Download>;
}

export { DownloadRepository };