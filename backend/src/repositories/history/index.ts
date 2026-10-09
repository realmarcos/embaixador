import { Download } from "../downloads/types";
import { HistoryPageQuery } from "./types";

interface HistoryRepository {
  findPage(query: HistoryPageQuery): Promise<Download[]>;
  findByIdForOwner(id: string, userId: string): Promise<Download | null>;
  findAllForOwner(userId: string): Promise<Download[]>;
  deleteByIdForOwner(id: string, userId: string): Promise<boolean>;
  deleteAllForOwner(userId: string): Promise<void>;
}

export { HistoryRepository };