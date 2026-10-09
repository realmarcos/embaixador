import type { RequestHandler, Response } from "express";
import { AppError } from "../../errors/app-errors";
import { Download } from "../../repositories/downloads/types";
import { MediaStorageProvider } from "../../providers/media-storage";
import { CreateDownloadService } from "../../services/downloads/create-download-service";
import { FindDownloadService } from "../../services/downloads/find-download-service";

interface AuthenticatedLocals {
  auth?: { userId: string };
}

interface CreateDownloadControllerInput {
  createDownloadService: Pick<CreateDownloadService, "execute">;
  findDownloadService: Pick<FindDownloadService, "execute">;
  mediaStorage: Pick<MediaStorageProvider, "getObjectStream">;
}

function toPublicDownload(download: Download) {
  return {
    id: download.id,
    platform: download.platform,
    title: download.title,
    status: download.status,
    selectedPresetId: download.selectedPresetId,
    fileName: download.fileName,
    mimeType: download.mimeType,
    sizeBytes: download.sizeBytes === null ? null : Number(download.sizeBytes),
    expiresAt: download.expiresAt,
    failureCode: download.failureCode,
    createdAt: download.createdAt,
  };
}

function safeAttachmentName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "media";
  const safeName = baseName
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/["\\]/g, "_")
    .trim()
    .slice(0, 255);
  return safeName || "media";
}

function createDownloadController({
  createDownloadService,
  findDownloadService,
  mediaStorage,
}: CreateDownloadControllerInput) {
  const create: RequestHandler = async (request, response, next) => {
    const body = request.body as Record<string, unknown> | undefined;
    const userId = (response as Response<unknown, AuthenticatedLocals>).locals.auth?.userId;
    if (!userId) {
      next(new AppError({ message: "Authentication required", code: "UNAUTHENTICATED", statusCode: 401 }));
      return;
    }

    if (
      typeof body?.url !== "string" ||
      typeof body.presetId !== "string" ||
      body.presetId.length < 1 ||
      body.presetId.length > 64
    ) {
      next(new AppError({ message: "Invalid download request", code: "INVALID_REQUEST", statusCode: 400 }));
      return;
    }

    try {
      const download = await createDownloadService.execute({
        userId,
        sourceUrl: body.url,
        presetId: body.presetId,
      });
      response.status(202).json(toPublicDownload(download));
    } catch (error) {
      next(error);
    }
  };

  const find: RequestHandler = async (request, response, next) => {
    const userId = (response as Response<unknown, AuthenticatedLocals>).locals.auth?.userId;
    if (!userId) {
      next(new AppError({ message: "Authentication required", code: "UNAUTHENTICATED", statusCode: 401 }));
      return;
    }
    const downloadId = request.params.downloadId;
    if (typeof downloadId !== "string") {
      next(new AppError({ message: "Download not found", code: "DOWNLOAD_NOT_FOUND", statusCode: 404 }));
      return;
    }

    try {
      const download = await findDownloadService.execute({ id: downloadId, userId });
      response.status(200).json(toPublicDownload(download));
    } catch (error) {
      next(error);
    }
  };

  const stream: RequestHandler = async (request, response, next) => {
    const userId = (response as Response<unknown, AuthenticatedLocals>).locals.auth?.userId;
    if (!userId) {
      next(new AppError({ message: "Authentication required", code: "UNAUTHENTICATED", statusCode: 401 }));
      return;
    }
    const downloadId = request.params.downloadId;
    if (typeof downloadId !== "string") {
      next(new AppError({ message: "Download not found", code: "DOWNLOAD_NOT_FOUND", statusCode: 404 }));
      return;
    }

    let download: Download;
    try {
      download = await findDownloadService.execute({ id: downloadId, userId });
    } catch (error) {
      next(error);
      return;
    }

    if (download.status !== "READY" || !download.storageObjectKey || !download.expiresAt) {
      const isGone = download.status === "EXPIRED" || download.status === "MEDIA_DELETED";
      next(new AppError({
        message: isGone ? "This media is no longer available" : "This download is not ready",
        code: isGone ? "MEDIA_UNAVAILABLE" : "DOWNLOAD_NOT_READY",
        statusCode: isGone ? 410 : 409,
      }));
      return;
    }
    if (download.expiresAt.getTime() <= Date.now()) {
      next(new AppError({
        message: "This media is no longer available",
        code: "MEDIA_UNAVAILABLE",
        statusCode: 410,
      }));
      return;
    }

    try {
      const media = await mediaStorage.getObjectStream(download.storageObjectKey);
      response.setHeader("Content-Type", download.mimeType ?? "application/octet-stream");
      response.setHeader("Content-Length", String(download.sizeBytes ?? 0));
      response.setHeader("Content-Disposition", `attachment; filename="${safeAttachmentName(download.fileName ?? "media")}"`);
      response.setHeader("Cache-Control", "private, no-store");
      media.on("error", () => response.destroy());
      media.pipe(response);
    } catch (error) {
      next(error);
    }
  };

  return { create, find, stream };
}

export { createDownloadController };