import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors/app-errors";
import { errorHandlerMiddleware } from "../middlewares/error-handler-middleware";
import { createHistoryRoutes } from "../routes/history-routes";
import { createSettingsRoutes } from "../routes/settings-routes";

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  return body as T;
}

describe("history and settings HTTP contract", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl: string;
  const listHistoryService = { execute: vi.fn() };
  const deleteHistoryService = { deleteMedia: vi.fn(), deleteOne: vi.fn(), deleteAll: vi.fn() };
  const redownloadService = { execute: vi.fn() };
  const getSettingsService = { execute: vi.fn() };
  const updateSettingsService = { execute: vi.fn() };
  const verifyToken = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    listHistoryService.execute.mockResolvedValue({ items: [], nextCursor: null });
    deleteHistoryService.deleteMedia.mockResolvedValue(undefined);
    deleteHistoryService.deleteOne.mockResolvedValue(undefined);
    deleteHistoryService.deleteAll.mockResolvedValue(undefined);
    redownloadService.execute.mockResolvedValue({ id: "download-new", status: "QUEUED" });
    getSettingsService.execute.mockResolvedValue({ themePreference: "LIGHT", retentionHours: 1 });
    updateSettingsService.execute.mockResolvedValue({ themePreference: "DARK", retentionHours: 24 });
    verifyToken.mockImplementation((token: string) => Promise.resolve({
      subject: token === "owner-token" ? "owner-1" : "other-owner",
    }));

    const app = express();
    app.use(express.json());
    app.use(createSettingsRoutes({ getSettingsService, updateSettingsService, verifyToken }));
    app.use(createHistoryRoutes({ listHistoryService, deleteHistoryService, redownloadService, verifyToken }));
    app.use(errorHandlerMiddleware);
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("lists history for the authenticated owner and rejects anonymous requests", async () => {
    const anonymous = await fetch(`${baseUrl}/history`);
    expect(anonymous.status).toBe(401);

    const response = await fetch(`${baseUrl}/history?limit=25&cursor=opaque-cursor`, {
      headers: { cookie: "embaixador_session=owner-token" },
    });

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ items: [], nextCursor: null });
    expect(listHistoryService.execute).toHaveBeenCalledWith({
      userId: "owner-1",
      cursor: "opaque-cursor",
      limit: 25,
    });
  });

  it("deletes one item, all history, or only media using owner-scoped services", async () => {
    const headers = { cookie: "embaixador_session=owner-token" };
    const one = await fetch(`${baseUrl}/history/download-1`, { method: "DELETE", headers });
    const all = await fetch(`${baseUrl}/history`, { method: "DELETE", headers });
    const media = await fetch(`${baseUrl}/history/download-1/media`, { method: "DELETE", headers });

    expect(one.status).toBe(204);
    expect(all.status).toBe(204);
    expect(media.status).toBe(204);
    expect(deleteHistoryService.deleteOne).toHaveBeenCalledWith({ userId: "owner-1", downloadId: "download-1" });
    expect(deleteHistoryService.deleteAll).toHaveBeenCalledWith("owner-1");
    expect(deleteHistoryService.deleteMedia).toHaveBeenCalledWith({ userId: "owner-1", downloadId: "download-1" });
  });

  it("queues an owner-scoped re-download", async () => {
    const response = await fetch(`${baseUrl}/history/download-1/redownload`, {
      method: "POST",
      headers: { cookie: "embaixador_session=owner-token" },
    });

    expect(response.status).toBe(202);
    await expect(readJson(response)).resolves.toMatchObject({ id: "download-new", status: "QUEUED" });
    expect(redownloadService.execute).toHaveBeenCalledWith({ userId: "owner-1", downloadId: "download-1" });
  });

  it("reads and updates only the authenticated account's settings", async () => {
    const headers = { cookie: "embaixador_session=owner-token" };
    const readResponse = await fetch(`${baseUrl}/settings`, { headers });
    const updateResponse = await fetch(`${baseUrl}/settings`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ themePreference: "DARK", retentionHours: 24 }),
    });

    expect(readResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    await expect(readJson(readResponse)).resolves.toEqual({ themePreference: "LIGHT", retentionHours: 1 });
    await expect(readJson(updateResponse)).resolves.toEqual({ themePreference: "DARK", retentionHours: 24 });
    expect(getSettingsService.execute).toHaveBeenCalledWith("owner-1");
    expect(updateSettingsService.execute).toHaveBeenCalledWith({
      userId: "owner-1",
      settings: { themePreference: "DARK", retentionHours: 24 },
    });
  });

  it("returns a safe error envelope for cross-owner lookups and deletion failures", async () => {
    deleteHistoryService.deleteOne.mockRejectedValueOnce(new AppError({
      message: "History item not found",
      code: "HISTORY_NOT_FOUND",
      statusCode: 404,
    })).mockRejectedValueOnce(new AppError({
      message: "Unable to remove this media right now",
      code: "MEDIA_DELETE_FAILED",
      statusCode: 502,
      details: "secret storage failure",
    }));

    const crossOwner = await fetch(`${baseUrl}/history/download-1`, {
      method: "DELETE",
      headers: { cookie: "embaixador_session=other-token" },
    });
    const failedDelete = await fetch(`${baseUrl}/history/download-1`, {
      method: "DELETE",
      headers: { cookie: "embaixador_session=owner-token" },
    });

    expect(crossOwner.status).toBe(404);
    expect(failedDelete.status).toBe(500);
    expect(deleteHistoryService.deleteOne).toHaveBeenNthCalledWith(1, { userId: "other-owner", downloadId: "download-1" });
    expect(deleteHistoryService.deleteOne).toHaveBeenNthCalledWith(2, { userId: "owner-1", downloadId: "download-1" });
    const body = await readJson<{ error: { code: string; message: string; requestId: string } }>(failedDelete);
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(body.error.message).not.toContain("secret");
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });
});