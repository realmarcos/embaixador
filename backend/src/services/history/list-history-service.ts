import { AppError } from "../../errors/app-errors";
import { HistoryRepository } from "../../repositories/history";
import { HistoryCursor } from "../../repositories/history/types";

const defaultPageSize = 20;
const maximumPageSize = 100;

interface ListHistoryServiceInput {
  userId: string;
  cursor?: string;
  limit?: number;
}

interface ListHistoryServiceDependencies {
  historyRepository: Pick<HistoryRepository, "findPage">;
}

function invalidHistoryQuery(): AppError {
  return new AppError({
    message: "The history query is invalid",
    code: "INVALID_HISTORY_QUERY",
    statusCode: 400,
  });
}

function decodeCursor(value: string | undefined): HistoryCursor | null {
  if (value === undefined) {
    return null;
  }
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
    throw invalidHistoryQuery();
  }

  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      throw invalidHistoryQuery();
    }
    const cursor = decoded as Record<string, unknown>;
    if (typeof cursor.id !== "string" || cursor.id.length === 0 || typeof cursor.createdAt !== "string") {
      throw invalidHistoryQuery();
    }
    const createdAt = new Date(cursor.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw invalidHistoryQuery();
    }
    return { id: cursor.id, createdAt };
  } catch {
    throw invalidHistoryQuery();
  }
}

function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString("base64url");
}

class ListHistoryService {
  constructor(private readonly dependencies: ListHistoryServiceDependencies) {}

  async execute({ userId, cursor, limit = defaultPageSize }: ListHistoryServiceInput) {
    if (!Number.isInteger(limit) || limit < 1 || limit > maximumPageSize) {
      throw invalidHistoryQuery();
    }

    const records = await this.dependencies.historyRepository.findPage({
      userId,
      cursor: decodeCursor(cursor),
      limit: limit + 1,
    });
    const hasNextPage = records.length > limit;
    const items = hasNextPage ? records.slice(0, limit) : records;
    const lastItem = items.at(-1);

    return {
      items,
      nextCursor: hasNextPage && lastItem
        ? encodeCursor({ id: lastItem.id, createdAt: lastItem.createdAt })
        : null,
    };
  }
}

export { ListHistoryService };