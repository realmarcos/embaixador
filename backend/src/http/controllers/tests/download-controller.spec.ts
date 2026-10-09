import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Download } from "../../../repositories/downloads/types";
import { createDownloadController } from "../download-controller";

const readyDownload: Download = {
  id: "download-1",
  userId: "owner-1",
  platform: "YOUTUBE",
  sourceUrlCiphertext: "private-ciphertext",
  sourceUrlIv: "iv",
  sourceUrlTag: "tag",
  sourceUrlKeyVersion: "v1",
  title: "Private video",
  selectedFormatId: "format-1",
  selectedPresetId: "video-720p",
  targetContainer: null,
  targetHeight: null,
  targetWidth: null,
  targetAudioOnly: false,
  status: "READY",
  storageObjectKey: "private-object-key",
  fileName: "../private\r\nname.mp4",
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

function createContext({
  userId,
  body,
  downloadId = "download-1",
}: {
  userId?: string;
  body?: unknown;
  downloadId?: string | string[];
} = {}) {
  const request = { body, params: { downloadId } } as unknown as Request;
  const state = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string>, ended: false, destroyed: false };
  const response = {
    locals: userId ? { auth: { userId } } : {},
    status(code: number) { state.statusCode = code; return response; },
    json(bodyValue: unknown) { state.body = bodyValue; return response; },
    end() { state.ended = true; return response; },
    setHeader(name: string, value: string) { state.headers[name.toLowerCase()] = value; return response; },
    destroy() { state.destroyed = true; return response; },
    headersSent: false,
  } as unknown as Response;
  return { request, response, state };
}

describe("download controller", () => {
  const createDownloadService = { execute: vi.fn() };
  const findDownloadService = { execute: vi.fn() };
  const mediaStorage = { getObjectStream: vi.fn() };
  const controller = createDownloadController({ createDownloadService, findDownloadService, mediaStorage });

  beforeEach(() => {
    vi.clearAllMocks();
    createDownloadService.execute.mockResolvedValue(readyDownload);
    findDownloadService.execute.mockResolvedValue(readyDownload);
    mediaStorage.getObjectStream.mockResolvedValue(Readable.from(Buffer.from("private bytes")));
  });

  it("rejects anonymous and malformed creation requests", async () => {
    const anonymous = createContext({ body: { url: "https://youtube.com/watch?v=x", presetId: "video-720p" } });
    const unauthenticated = vi.fn();
    await controller.create(anonymous.request, anonymous.response, unauthenticated);
    expect(unauthenticated.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });

    const invalid = createContext({ userId: "owner-1", body: { url: "", presetId: 2 } });
    const invalidRequest = vi.fn();
    await controller.create(invalid.request, invalid.response, invalidRequest);
    expect(invalidRequest.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_REQUEST", statusCode: 400 });
    expect(createDownloadService.execute).not.toHaveBeenCalled();

    const oversizedPreset = createContext({
      userId: "owner-1",
      body: { url: "https://youtube.com/watch?v=x", presetId: "x".repeat(65) },
    });
    const oversizedRequest = vi.fn();
    await controller.create(oversizedPreset.request, oversizedPreset.response, oversizedRequest);
    expect(oversizedRequest.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_REQUEST", statusCode: 400 });
  });

  it("queues for the authenticated owner and omits internal fields", async () => {
    const context = createContext({
      userId: "owner-1",
      body: { url: "https://youtube.com/watch?v=x", presetId: "video-720p" },
    });

    await controller.create(context.request, context.response, vi.fn());

    expect(createDownloadService.execute).toHaveBeenCalledWith({
      userId: "owner-1",
      sourceUrl: "https://youtube.com/watch?v=x",
      presetId: "video-720p",
    });
    expect(context.state.statusCode).toBe(202);
    const body = context.state.body as Record<string, unknown>;
    expect(body.selectedPresetId).toBe("video-720p");
    expect(body.sizeBytes).toBe(12);
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("sourceUrlCiphertext");
    expect(body).not.toHaveProperty("storageObjectKey");
  });

  it("returns owner-scoped status and forwards lookup errors", async () => {
    const context = createContext({ userId: "owner-1" });
    await controller.find(context.request, context.response, vi.fn());
    expect(findDownloadService.execute).toHaveBeenCalledWith({ id: "download-1", userId: "owner-1" });
    expect(context.state.statusCode).toBe(200);

    const failed = createContext({ userId: "owner-1" });
    const lookupError = new Error("not found");
    findDownloadService.execute.mockRejectedValueOnce(lookupError);
    const next = vi.fn();
    await controller.find(failed.request, failed.response, next);
    expect(next.mock.calls[0]?.[0]).toBe(lookupError);
  });

  it("rejects missing ownership and malformed identifiers before lookup", async () => {
    const anonymous = createContext();
    const noAuth = vi.fn();
    await controller.find(anonymous.request, anonymous.response, noAuth);
    expect(noAuth.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });

    const malformed = createContext({ userId: "owner-1", downloadId: ["one", "two"] });
    const badId = vi.fn();
    await controller.find(malformed.request, malformed.response, badId);
    expect(badId.mock.calls[0]?.[0]).toMatchObject({ code: "DOWNLOAD_NOT_FOUND", statusCode: 404 });
    expect(findDownloadService.execute).not.toHaveBeenCalled();
  });

  it("rejects anonymous stream requests before querying the owner record", async () => {
    const anonymous = createContext();
    const next = vi.fn();

    await controller.stream(anonymous.request, anonymous.response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED", statusCode: 401 });
    expect(findDownloadService.execute).not.toHaveBeenCalled();
    expect(mediaStorage.getObjectStream).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...readyDownload, status: "PROCESSING" as const }, 409],
    [{ ...readyDownload, status: "FAILED" as const }, 409],
    [{ ...readyDownload, status: "EXPIRED" as const }, 410],
    [{ ...readyDownload, status: "MEDIA_DELETED" as const }, 410],
    [{ ...readyDownload, storageObjectKey: null }, 409],
    [{ ...readyDownload, expiresAt: null }, 409],
  ])("denies file streaming for status or metadata %#", async (download, statusCode) => {
    findDownloadService.execute.mockResolvedValueOnce(download);
    const context = createContext({ userId: "owner-1" });
    const next = vi.fn();

    await controller.stream(context.request, context.response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode });
    expect(mediaStorage.getObjectStream).not.toHaveBeenCalled();
  });

  it("rejects an expired READY record and only streams a current owned file privately", async () => {
    findDownloadService.execute.mockResolvedValueOnce({ ...readyDownload, expiresAt: new Date(0) });
    const expired = createContext({ userId: "owner-1" });
    const expiredNext = vi.fn();
    await controller.stream(expired.request, expired.response, expiredNext);
    expect(expiredNext.mock.calls[0]?.[0]).toMatchObject({ code: "MEDIA_UNAVAILABLE", statusCode: 410 });

    const current = createContext({ userId: "owner-1" });
    await controller.stream(current.request, current.response, vi.fn());
    expect(mediaStorage.getObjectStream).toHaveBeenCalledWith("private-object-key");
    expect(current.state.headers["cache-control"]).toBe("private, no-store");
    expect(current.state.headers["content-disposition"]).toContain("privatename.mp4");
    expect(current.state.headers["content-disposition"]).not.toContain("\r");
  });

  it("handles malformed stream IDs, lookup failures, and fallback response metadata", async () => {
    const malformed = createContext({ userId: "owner-1", downloadId: ["a", "b"] });
    const malformedNext = vi.fn();
    await controller.stream(malformed.request, malformed.response, malformedNext);
    expect(malformedNext.mock.calls[0]?.[0]).toMatchObject({ code: "DOWNLOAD_NOT_FOUND", statusCode: 404 });

    const lookupError = new Error("lookup failed");
    findDownloadService.execute.mockRejectedValueOnce(lookupError);
    const failedLookup = createContext({ userId: "owner-1" });
    const lookupNext = vi.fn();
    await controller.stream(failedLookup.request, failedLookup.response, lookupNext);
    expect(lookupNext.mock.calls[0]?.[0]).toBe(lookupError);
    expect(mediaStorage.getObjectStream).not.toHaveBeenCalled();

    findDownloadService.execute.mockResolvedValueOnce({
      ...readyDownload,
      mimeType: null,
      sizeBytes: null,
      fileName: null,
    });
    const fallback = createContext({ userId: "owner-1" });
    await controller.stream(fallback.request, fallback.response, vi.fn());
    expect(fallback.state.headers["content-type"]).toBe("application/octet-stream");
    expect(fallback.state.headers["content-length"]).toBe("0");
    expect(fallback.state.headers["content-disposition"]).toContain("filename=\"media\"");
  });

  it("maps storage errors and destroys a response when an active stream errors", async () => {
    mediaStorage.getObjectStream.mockRejectedValueOnce(new Error("private storage endpoint"));
    const failed = createContext({ userId: "owner-1" });
    const failedNext = vi.fn();
    await controller.stream(failed.request, failed.response, failedNext);
    expect(failedNext.mock.calls[0]?.[0]).toEqual(new Error("private storage endpoint"));

    const stream = new Readable({ read() { this.push(null); } });
    mediaStorage.getObjectStream.mockResolvedValueOnce(stream);
    const active = createContext({ userId: "owner-1" });
    await controller.stream(active.request, active.response, vi.fn());
    stream.emit("error", new Error("stream reset"));
    expect(active.state.destroyed).toBe(true);
  });
});