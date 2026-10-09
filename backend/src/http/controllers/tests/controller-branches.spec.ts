import type { Request, RequestHandler, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../errors/app-errors";
import { Download } from "../../../repositories/downloads/types";
import { createDownloadController } from "../download-controller";
import { createHistoryController } from "../history-controller";
import { createMediaController } from "../media-controller";
import { createSettingsController } from "../settings-controller";

function createRequest(input: {
  body?: unknown;
  params?: Record<string, string | string[]>;
  query?: Record<string, unknown>;
} = {}): Request {
  return {
    body: input.body,
    params: input.params ?? {},
    query: input.query ?? {},
  } as unknown as Request;
}

function createResponse(userId?: string) {
  const response = {
    locals: userId ? { auth: { userId } } : {},
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
    end() {
      return response;
    },
    setHeader(name: string, value: string) {
      response.headers[name.toLowerCase()] = value;
      return response;
    },
    destroy() {
      return response;
    },
  };
  return response as unknown as Response & {
    locals: { auth?: { userId: string } };
    statusCode: number;
    body?: unknown;
    headers: Record<string, string>;
  };
}

async function invoke(handler: RequestHandler, request: Request, response: Response): Promise<ReturnType<typeof vi.fn>> {
  const next = vi.fn();
  await handler(request, response, next);
  return next;
}

const download: Download = {
  id: "download-1",
  userId: "owner-1",
  platform: "YOUTUBE",
  sourceUrlCiphertext: "private-ciphertext",
  sourceUrlIv: "private-iv",
  sourceUrlTag: "private-tag",
  sourceUrlKeyVersion: "v1",
  title: "Safe title",
  selectedFormatId: "format-1",
  targetContainer: null,
  targetHeight: null,
  status: "READY",
  storageObjectKey: "private-object-key",
  fileName: "video.mp4",
  mimeType: "video/mp4",
  sizeBytes: BigInt(12),
  retentionHoursSnapshot: 1,
  completedAt: new Date("2026-10-08T10:00:00.000Z"),
  expiresAt: new Date("2099-10-08T10:00:00.000Z"),
  failureCode: null,
  replayOfId: null,
  createdAt: new Date("2026-10-08T10:00:00.000Z"),
  updatedAt: new Date("2026-10-08T10:00:00.000Z"),
};

describe("media controller validation and service failures", () => {
  it("rejects missing/oversized URLs, maps provider errors, and returns analysis", async () => {
    const analyzeMediaService = { execute: vi.fn() };
    const controller = createMediaController({ analyzeMediaService });
    const invalidNext = await invoke(controller.analyze, createRequest({ body: {} }), createResponse("owner-1"));
    expect(invalidNext.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_MEDIA_URL", statusCode: 400 });

    const longNext = await invoke(
      controller.analyze,
      createRequest({ body: { url: `https://youtube.com/${"a".repeat(2048)}` } }),
      createResponse("owner-1"),
    );
    expect(longNext.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_MEDIA_URL" });

    analyzeMediaService.execute.mockRejectedValueOnce(new Error("provider failure"));
    const failedNext = await invoke(
      controller.analyze,
      createRequest({ body: { url: "https://youtube.com/video" } }),
      createResponse("owner-1"),
    );
    expect(failedNext).toHaveBeenCalledWith(expect.any(Error));

    analyzeMediaService.execute.mockResolvedValueOnce({ platform: "YOUTUBE", options: [] });
    const response = createResponse("owner-1");
    const successNext = await invoke(
      controller.analyze,
      createRequest({ body: { url: "https://youtube.com/video" } }),
      response,
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ platform: "YOUTUBE" });
    expect(successNext).not.toHaveBeenCalled();
  });
});

describe("settings controller branches", () => {
  it("handles missing account context, service errors, reads, and patches", async () => {
    const getSettingsService = { execute: vi.fn() };
    const updateSettingsService = { execute: vi.fn() };
    const controller = createSettingsController({ getSettingsService, updateSettingsService });

    const unauthGet = await invoke(controller.get, createRequest(), createResponse());
    expect(unauthGet.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED", statusCode: 401 });
    getSettingsService.execute.mockRejectedValueOnce(new Error("db unavailable"));
    const failedGet = await invoke(controller.get, createRequest(), createResponse("owner-1"));
    expect(failedGet).toHaveBeenCalledWith(expect.any(Error));
    getSettingsService.execute.mockResolvedValueOnce({ themePreference: "LIGHT", retentionHours: 1 });
    const getResponse = createResponse("owner-1");
    await invoke(controller.get, createRequest(), getResponse);
    expect(getResponse.body).toEqual({ themePreference: "LIGHT", retentionHours: 1 });

    const unauthPatch = await invoke(controller.patch, createRequest({ body: {} }), createResponse());
    expect(unauthPatch.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED" });
    updateSettingsService.execute.mockRejectedValueOnce(new AppError({ message: "invalid", code: "INVALID_SETTINGS", statusCode: 400 }));
    const failedPatch = await invoke(controller.patch, createRequest({ body: {} }), createResponse("owner-1"));
    expect(failedPatch.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_SETTINGS", statusCode: 400 });
    updateSettingsService.execute.mockResolvedValueOnce({ themePreference: "DARK", retentionHours: 24 });
    const patchResponse = createResponse("owner-1");
    await invoke(controller.patch, createRequest({ body: { themePreference: "DARK" } }), patchResponse);
    expect(updateSettingsService.execute).toHaveBeenCalledWith({ userId: "owner-1", settings: { themePreference: "DARK" } });
    expect(patchResponse.body).toEqual({ themePreference: "DARK", retentionHours: 24 });
  });
});

describe("download controller branches", () => {
  const createDownloadService = { execute: vi.fn() };
  const findDownloadService = { execute: vi.fn() };
  const mediaStorage = { getObjectStream: vi.fn() };
  const controller = createDownloadController({ createDownloadService, findDownloadService, mediaStorage });

  it("validates queue input and maps authenticated service success/failure", async () => {
    const unauthorized = await invoke(controller.create, createRequest(), createResponse());
    expect(unauthorized.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED", statusCode: 401 });
    const invalid = await invoke(controller.create, createRequest({ body: { url: 3 } }), createResponse("owner-1"));
    expect(invalid.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_REQUEST", statusCode: 400 });

    createDownloadService.execute.mockRejectedValueOnce(new Error("database secret"));
    const failed = await invoke(
      controller.create,
      createRequest({ body: { url: "https://youtube.com/video", formatId: "format-1" } }),
      createResponse("owner-1"),
    );
    expect(failed).toHaveBeenCalledWith(expect.any(Error));
    createDownloadService.execute.mockResolvedValueOnce(download);
    const response = createResponse("owner-1");
    await invoke(
      controller.create,
      createRequest({ body: { url: "https://youtube.com/video", formatId: "format-1" } }),
      response,
    );
    expect(response.statusCode).toBe(202);
    expect(response.body).not.toHaveProperty("userId");
    expect(response.body).not.toHaveProperty("sourceUrlCiphertext");
  });

  it("handles missing IDs/owners and maps lookup failures", async () => {
    const unauthenticated = await invoke(controller.find, createRequest({ params: { downloadId: "download-1" } }), createResponse());
    expect(unauthenticated.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED" });
    const invalidParams = await invoke(controller.find, createRequest({ params: { downloadId: ["a", "b"] } }), createResponse("owner-1"));
    expect(invalidParams.mock.calls[0]?.[0]).toMatchObject({ code: "DOWNLOAD_NOT_FOUND", statusCode: 404 });

    findDownloadService.execute.mockRejectedValueOnce(new Error("query failed"));
    const failed = await invoke(controller.find, createRequest({ params: { downloadId: "download-1" } }), createResponse("owner-1"));
    expect(failed).toHaveBeenCalledWith(expect.any(Error));
    findDownloadService.execute.mockResolvedValueOnce(download);
    const response = createResponse("owner-1");
    await invoke(controller.find, createRequest({ params: { downloadId: "download-1" } }), response);
    expect(response.body).not.toHaveProperty("storageObjectKey");
    expect(response.body).not.toHaveProperty("userId");
  });

  it("denies stream states and expired dates before storage access", async () => {
    const notReady = { ...download, status: "PROCESSING" as const };
    findDownloadService.execute.mockResolvedValueOnce(notReady).mockResolvedValueOnce({
      ...download,
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    const response = createResponse("owner-1");
    const notReadyNext = await invoke(controller.stream, createRequest({ params: { downloadId: "download-1" } }), response);
    expect(notReadyNext.mock.calls[0]?.[0]).toMatchObject({ code: "DOWNLOAD_NOT_READY", statusCode: 409 });
    const expiredNext = await invoke(controller.stream, createRequest({ params: { downloadId: "download-1" } }), createResponse("owner-1"));
    expect(expiredNext.mock.calls[0]?.[0]).toMatchObject({ code: "MEDIA_UNAVAILABLE", statusCode: 410 });
    expect(mediaStorage.getObjectStream).not.toHaveBeenCalled();
  });

  it("passes storage failures to the safe error middleware", async () => {
    findDownloadService.execute.mockResolvedValueOnce(download);
    mediaStorage.getObjectStream.mockRejectedValueOnce(new Error("private S3 details"));
    const next = await invoke(controller.stream, createRequest({ params: { downloadId: "download-1" } }), createResponse("owner-1"));
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("history controller branches", () => {
  const listHistoryService = { execute: vi.fn() };
  const deleteHistoryService = { deleteMedia: vi.fn(), deleteOne: vi.fn(), deleteAll: vi.fn() };
  const redownloadService = { execute: vi.fn() };
  const controller = createHistoryController({ listHistoryService, deleteHistoryService, redownloadService });

  it("validates owner/query and returns a public history projection", async () => {
    const unauthorized = await invoke(controller.list, createRequest(), createResponse());
    expect(unauthorized.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED" });
    const invalidCursor = await invoke(
      controller.list,
      createRequest({ query: { cursor: ["one", "two"] } }),
      createResponse("owner-1"),
    );
    expect(invalidCursor.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_HISTORY_QUERY" });

    listHistoryService.execute.mockRejectedValueOnce(new Error("query failure"));
    const failed = await invoke(controller.list, createRequest(), createResponse("owner-1"));
    expect(failed).toHaveBeenCalledWith(expect.any(Error));
    listHistoryService.execute.mockResolvedValueOnce({ items: [download], nextCursor: null });
    const response = createResponse("owner-1");
    await invoke(controller.list, createRequest(), response);
    expect(response.body).toMatchObject({ items: [{ id: "download-1", sizeBytes: 12 }] });
    expect(JSON.stringify(response.body)).not.toContain("private-object-key");
  });

  it("handles owner/param failures and forwards deletion/re-download outcomes", async () => {
    const paramsInvalid = createRequest({ params: { downloadId: ["one", "two"] } });
    const unauthDelete = await invoke(controller.deleteOne, paramsInvalid, createResponse());
    expect(unauthDelete.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED" });

    const methods: RequestHandler[] = [controller.deleteOne, controller.deleteMedia, controller.redownload];
    for (const handler of methods) {
      const invalidParam = await invoke(handler, paramsInvalid, createResponse("owner-1"));
      expect(invalidParam.mock.calls[0]?.[0]).toMatchObject({ code: "HISTORY_NOT_FOUND" });
    }

    deleteHistoryService.deleteAll.mockRejectedValueOnce(new Error("delete failure"));
    const failedAll = await invoke(controller.deleteAll, createRequest(), createResponse("owner-1"));
    expect(failedAll).toHaveBeenCalledWith(expect.any(Error));
    deleteHistoryService.deleteAll.mockResolvedValueOnce(undefined);
    const allResponse = createResponse("owner-1");
    await invoke(controller.deleteAll, createRequest(), allResponse);
    expect(allResponse.statusCode).toBe(204);

    deleteHistoryService.deleteOne.mockResolvedValueOnce(undefined);
    const oneResponse = createResponse("owner-1");
    await invoke(controller.deleteOne, createRequest({ params: { downloadId: "download-1" } }), oneResponse);
    expect(oneResponse.statusCode).toBe(204);
    deleteHistoryService.deleteMedia.mockResolvedValueOnce(undefined);
    const mediaResponse = createResponse("owner-1");
    await invoke(controller.deleteMedia, createRequest({ params: { downloadId: "download-1" } }), mediaResponse);
    expect(mediaResponse.statusCode).toBe(204);
    redownloadService.execute.mockResolvedValueOnce(download);
    const replayResponse = createResponse("owner-1");
    await invoke(controller.redownload, createRequest({ params: { downloadId: "download-1" } }), replayResponse);
    expect(replayResponse.statusCode).toBe(202);
    expect(replayResponse.body).not.toHaveProperty("userId");
  });
});