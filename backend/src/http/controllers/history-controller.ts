import type { RequestHandler, Response } from "express";
import { AppError } from "../../errors/app-errors";
import { Download } from "../../repositories/downloads/types";
import { DeleteHistoryService } from "../../services/history/delete-history-service";
import { ListHistoryService } from "../../services/history/list-history-service";
import { RedownloadFromHistoryService } from "../../services/history/redownload-from-history-service";

interface AuthenticatedLocals {
  auth?: { userId: string };
}

interface HistoryControllerDependencies {
  listHistoryService: Pick<ListHistoryService, "execute">;
  deleteHistoryService: Pick<DeleteHistoryService, "deleteMedia" | "deleteOne" | "deleteAll">;
  redownloadService: Pick<RedownloadFromHistoryService, "execute">;
}

function toPublicDownload(download: Download) {
  return {
    id: download.id,
    platform: download.platform,
    title: download.title,
    status: download.status,
    fileName: download.fileName,
    mimeType: download.mimeType,
    sizeBytes: download.sizeBytes === null ? null : Number(download.sizeBytes),
    expiresAt: download.expiresAt,
    failureCode: download.failureCode,
    createdAt: download.createdAt,
  };
}

function createHistoryController({ listHistoryService, deleteHistoryService, redownloadService }: HistoryControllerDependencies) {
  const userIdFrom = (
    response: Response<unknown, AuthenticatedLocals>,
  ): string | undefined => response.locals.auth?.userId;

  const list: RequestHandler = async (request, response, next) => {
    const userId = userIdFrom(response as Response<unknown, AuthenticatedLocals>);
    if (!userId) {
      next(new AppError({ message: "Authentication required", code: "UNAUTHENTICATED", statusCode: 401 }));
      return;
    }
    const rawLimit = request.query.limit;
    const limit = rawLimit === undefined
      ? undefined
      : typeof rawLimit === "string" && /^\d{1,3}$/.test(rawLimit)
        ? Number(rawLimit)
        : Number.NaN;
    const cursor = request.query.cursor;
    if (cursor !== undefined && typeof cursor !== "string") {
      next(new AppError({ message: "The history query is invalid", code: "INVALID_HISTORY_QUERY", statusCode: 400 }));
      return;
    }
    try {
      const page = await listHistoryService.execute({ userId, cursor, limit });
      response.status(200).json({ ...page, items: page.items.map(toPublicDownload) });
    } catch (error) {
      next(error);
    }
  };

  const deleteOne: RequestHandler = async (request, response, next) => {
    const userId = userIdFrom(response as Response<unknown, AuthenticatedLocals>);
    const downloadId = request.params.downloadId;
    if (!userId || typeof downloadId !== "string") {
      next(new AppError({
        message: "History item not found",
        code: userId ? "HISTORY_NOT_FOUND" : "UNAUTHENTICATED",
        statusCode: userId ? 404 : 401,
      }));
      return;
    }
    try {
      await deleteHistoryService.deleteOne({ userId, downloadId });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  const deleteAll: RequestHandler = async (_request, response, next) => {
    const userId = userIdFrom(response as Response<unknown, AuthenticatedLocals>);
    if (!userId) {
      next(new AppError({ message: "Authentication required", code: "UNAUTHENTICATED", statusCode: 401 }));
      return;
    }
    try {
      await deleteHistoryService.deleteAll(userId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  const deleteMedia: RequestHandler = async (request, response, next) => {
    const userId = userIdFrom(response as Response<unknown, AuthenticatedLocals>);
    const downloadId = request.params.downloadId;
    if (!userId || typeof downloadId !== "string") {
      next(new AppError({
        message: "History item not found",
        code: userId ? "HISTORY_NOT_FOUND" : "UNAUTHENTICATED",
        statusCode: userId ? 404 : 401,
      }));
      return;
    }
    try {
      await deleteHistoryService.deleteMedia({ userId, downloadId });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  const redownload: RequestHandler = async (request, response, next) => {
    const userId = userIdFrom(response as Response<unknown, AuthenticatedLocals>);
    const downloadId = request.params.downloadId;
    if (!userId || typeof downloadId !== "string") {
      next(new AppError({
        message: "History item not found",
        code: userId ? "HISTORY_NOT_FOUND" : "UNAUTHENTICATED",
        statusCode: userId ? 404 : 401,
      }));
      return;
    }
    try {
      const download = await redownloadService.execute({ userId, downloadId });
      response.status(202).json(toPublicDownload(download));
    } catch (error) {
      next(error);
    }
  };

  return { list, deleteOne, deleteAll, deleteMedia, redownload };
}

export { createHistoryController };