import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Download } from "../../../repositories/downloads/types";
import { createHistoryController } from "../history-controller";

const record: Download = {
  id: "download-1",
  userId: "owner-1",
  platform: "YOUTUBE",
  sourceUrlCiphertext: "private-ciphertext",
  sourceUrlIv: "iv",
  sourceUrlTag: "tag",
  sourceUrlKeyVersion: "v1",
  title: "Test media",
  selectedFormatId: "format-1",
  selectedPresetId: "video-720p",
  targetContainer: null,
  targetHeight: null,
  targetWidth: null,
  targetAudioOnly: false,
  status: "READY",
  storageObjectKey: "private-object-key",
  fileName: "media.mp4",
  mimeType: "video/mp4",
  sizeBytes: BigInt(2048),
  retentionHoursSnapshot: 8,
  completedAt: new Date("2026-10-08T10:00:00.000Z"),
  expiresAt: new Date("2026-10-08T18:00:00.000Z"),
  failureCode: null,
  replayOfId: null,
  createdAt: new Date("2026-10-08T10:00:00.000Z"),
  updatedAt: new Date("2026-10-08T10:00:00.000Z"),
};

function createHttpContext({
  userId,
  query = {},
  params = {},
}: {
  userId?: string;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
} = {}) {
  const request = { query, params } as unknown as Request;
  const responseState = { statusCode: 0, body: undefined as unknown, ended: false };
  const response = {
    locals: userId ? { auth: { userId } } : {},
    status(code: number) {
      responseState.statusCode = code;
      return response;
    },
    json(body: unknown) {
      responseState.body = body;
      return response;
    },
    end() {
      responseState.ended = true;
      return response;
    },
  } as unknown as Response;
  return { request, response, responseState };
}

describe("history controller", () => {
  const listHistoryService = { execute: vi.fn() };
  const deleteHistoryService = {
    deleteMedia: vi.fn(),
    deleteOne: vi.fn(),
    deleteAll: vi.fn(),
  };
  const redownloadService = { execute: vi.fn() };
  const controller = createHistoryController({ listHistoryService, deleteHistoryService, redownloadService });

  beforeEach(() => {
    vi.clearAllMocks();
    listHistoryService.execute.mockResolvedValue({ items: [record], nextCursor: null });
    deleteHistoryService.deleteMedia.mockResolvedValue(undefined);
    deleteHistoryService.deleteOne.mockResolvedValue(undefined);
    deleteHistoryService.deleteAll.mockResolvedValue(undefined);
    redownloadService.execute.mockResolvedValue(record);
  });

  it("requires auth for list and maps history to a public DTO", async () => {
    const anonymous = createHttpContext();
    const nextAnonymous = vi.fn();
    await controller.list(anonymous.request, anonymous.response, nextAnonymous);
    expect(nextAnonymous.mock.calls[0]?.[0]).toMatchObject({
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });

    const context = createHttpContext({ userId: "owner-1" });
    await controller.list(context.request, context.response, vi.fn());
    expect(listHistoryService.execute).toHaveBeenCalledWith({ userId: "owner-1", cursor: undefined, limit: undefined });
    expect(context.responseState.statusCode).toBe(200);
    const body = context.responseState.body as { items: Record<string, unknown>[]; nextCursor: string | null };
    expect(body.items[0]).toMatchObject({ id: "download-1", sizeBytes: 2048, selectedPresetId: "video-720p" });
    expect(body.items[0]).not.toHaveProperty("userId");
    expect(body.items[0]).not.toHaveProperty("sourceUrlCiphertext");
    expect(body.items[0]).not.toHaveProperty("storageObjectKey");
  });

  it("parses a scalar limit and rejects repeated cursor query values", async () => {
    const valid = createHttpContext({ userId: "owner-1", query: { limit: "25", cursor: "opaque" } });
    await controller.list(valid.request, valid.response, vi.fn());
    expect(listHistoryService.execute).toHaveBeenCalledWith({ userId: "owner-1", cursor: "opaque", limit: 25 });

    const invalid = createHttpContext({ userId: "owner-1", query: { cursor: ["first", "second"] } });
    const next = vi.fn();
    await controller.list(invalid.request, invalid.response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_HISTORY_QUERY", statusCode: 400 });
  });

  it("maps malformed limits to the service and forwards service errors", async () => {
    const context = createHttpContext({ userId: "owner-1", query: { limit: "1.5" } });
    listHistoryService.execute.mockRejectedValueOnce(new Error("query failed"));
    const next = vi.fn();

    await controller.list(context.request, context.response, next);

    expect(listHistoryService.execute).toHaveBeenCalledWith({ userId: "owner-1", cursor: undefined, limit: Number.NaN });
    expect(next.mock.calls[0]?.[0]).toEqual(new Error("query failed"));
  });

  it("owner-scopes individual delete and handles auth, malformed params, and errors", async () => {
    const anonymous = createHttpContext({ params: { downloadId: "download-1" } });
    const noAuth = vi.fn();
    await controller.deleteOne(anonymous.request, anonymous.response, noAuth);
    expect(noAuth.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED", statusCode: 401 });

    const malformed = createHttpContext({ userId: "owner-1", params: { downloadId: ["a", "b"] } });
    const badParam = vi.fn();
    await controller.deleteOne(malformed.request, malformed.response, badParam);
    expect(badParam.mock.calls[0]?.[0]).toMatchObject({ code: "HISTORY_NOT_FOUND", statusCode: 404 });

    const valid = createHttpContext({ userId: "owner-1", params: { downloadId: "download-1" } });
    await controller.deleteOne(valid.request, valid.response, vi.fn());
    expect(deleteHistoryService.deleteOne).toHaveBeenCalledWith({ userId: "owner-1", downloadId: "download-1" });
    expect(valid.responseState.statusCode).toBe(204);
    expect(valid.responseState.ended).toBe(true);

    deleteHistoryService.deleteOne.mockRejectedValueOnce(new Error("delete failed"));
    const failed = createHttpContext({ userId: "owner-1", params: { downloadId: "download-1" } });
    const failure = vi.fn();
    await controller.deleteOne(failed.request, failed.response, failure);
    expect(failure.mock.calls[0]?.[0]).toEqual(new Error("delete failed"));
  });

  it("handles delete-all auth, successful deletion, and failure", async () => {
    const anonymous = createHttpContext();
    const noAuth = vi.fn();
    await controller.deleteAll(anonymous.request, anonymous.response, noAuth);
    expect(noAuth.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });

    const valid = createHttpContext({ userId: "owner-1" });
    await controller.deleteAll(valid.request, valid.response, vi.fn());
    expect(deleteHistoryService.deleteAll).toHaveBeenCalledWith("owner-1");
    expect(valid.responseState.statusCode).toBe(204);

    deleteHistoryService.deleteAll.mockRejectedValueOnce(new Error("delete all failed"));
    const failed = createHttpContext({ userId: "owner-1" });
    const next = vi.fn();
    await controller.deleteAll(failed.request, failed.response, next);
    expect(next.mock.calls[0]?.[0]).toEqual(new Error("delete all failed"));
  });

  it("handles media-only delete auth, bad params, and successful retention", async () => {
    const anonymous = createHttpContext({ params: { downloadId: "download-1" } });
    const noAuth = vi.fn();
    await controller.deleteMedia(anonymous.request, anonymous.response, noAuth);
    expect(noAuth.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });

    const malformed = createHttpContext({ userId: "owner-1", params: { downloadId: ["bad"] } });
    const badParam = vi.fn();
    await controller.deleteMedia(malformed.request, malformed.response, badParam);
    expect(badParam.mock.calls[0]?.[0]).toMatchObject({ statusCode: 404 });

    const valid = createHttpContext({ userId: "owner-1", params: { downloadId: "download-1" } });
    await controller.deleteMedia(valid.request, valid.response, vi.fn());
    expect(deleteHistoryService.deleteMedia).toHaveBeenCalledWith({ userId: "owner-1", downloadId: "download-1" });
    expect(valid.responseState.statusCode).toBe(204);

    const mediaError = new Error("media deletion failed");
    deleteHistoryService.deleteMedia.mockRejectedValueOnce(mediaError);
    const failed = createHttpContext({ userId: "owner-1", params: { downloadId: "download-1" } });
    const next = vi.fn();
    await controller.deleteMedia(failed.request, failed.response, next);
    expect(next.mock.calls[0]?.[0]).toBe(mediaError);
  });

  it("redownloads an owned row and returns only public fields", async () => {
    const anonymous = createHttpContext({ params: { downloadId: "download-1" } });
    const noAuth = vi.fn();
    await controller.redownload(anonymous.request, anonymous.response, noAuth);
    expect(noAuth.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });

    const valid = createHttpContext({ userId: "owner-1", params: { downloadId: "download-1" } });
    await controller.redownload(valid.request, valid.response, vi.fn());
    expect(redownloadService.execute).toHaveBeenCalledWith({ userId: "owner-1", downloadId: "download-1" });
    expect(valid.responseState.statusCode).toBe(202);
    const body = valid.responseState.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("sourceUrlCiphertext");

    const redownloadError = new Error("re-analysis failed");
    redownloadService.execute.mockRejectedValueOnce(redownloadError);
    const failed = createHttpContext({ userId: "owner-1", params: { downloadId: "download-1" } });
    const next = vi.fn();
    await controller.redownload(failed.request, failed.response, next);
    expect(next.mock.calls[0]?.[0]).toBe(redownloadError);
  });
});