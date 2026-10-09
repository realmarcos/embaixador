interface HistoryCursor {
  createdAt: Date;
  id: string;
}

interface HistoryPageQuery {
  userId: string;
  cursor: HistoryCursor | null;
  limit: number;
}

export { HistoryCursor, HistoryPageQuery };