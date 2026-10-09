import express from "express";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors/app-errors";
import { errorHandlerMiddleware } from "../middlewares/error-handler-middleware";
import { createMediaRoutes } from "../routes/media-routes";
import { createDownloadRoutes } from "../routes/download-routes";

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  return body as T;
}

const mediaOption = {
  id: "format-720",
  container: "mp4",
  width: 1280,
  height: 720,
  qualityLabel: "720p",
  isOriginal: true,
};

const readyDownload = {
  id: "download-1",
  userId: "owner-1",
  platform: "YOUTUBE",
  sourceUrlCiphertext: "ciphertext",
  sourceUrlIv: "iv",
  sourceUrlTag: "tag",
  sourceUrlKeyVersion: "v1",
  title: "Safe title",
  selectedFormatId: "format-720",
  targetContainer: null,
  targetHeight: null,
  status: "READY",
  storageObjectKey: "owner-1/random-key",
  fileName: "video.mp4",
  mimeType: "video/mp4",
  sizeBytes: Buffer.byteLength("private-media-content"),
  retentionHoursSnapshot: 1,
  completedAt: new Date("2026-10-07T12:00:00.000Z"),
  expiresAt: new Date("2099-10-08T12:00:00.000Z"),
  failureCode: null,
  replayOfId: null,
  createdAt: "2026-10-07T12:00:00.000Z",
  updatedAt: "2026-10-07T12:00:00.000Z",
};

describe("media and download HTTP contract", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl: string;
  const analyzeMediaService = { execute: vi.fn() };
  const createDownloadService = { execute: vi.fn() };
  const findDownloadService = { execute: vi.fn() };
  const mediaStorage = { getObjectStream: vi.fn() };
  const verifyToken = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    analyzeMediaService.execute.mockResolvedValue({ platform: "YOUTUBE", title: "Safe title", options: [mediaOption] });
    createDownloadService.execute.mockResolvedValue(readyDownload);
    findDownloadService.execute.mockResolvedValue(readyDownload);
    mediaStorage.getObjectStream.mockResolvedValue(Readable.from(Buffer.from("private-media-content")));
    verifyToken.mockImplementation((token: string) => {
      if (token === "owner-token") {
        return Promise.resolve({ subject: "owner-1" });
      }
      return Promise.resolve({ subject: "other-owner" });
    });
    findDownloadService.execute.mockImplementation(({ userId }: { userId: string }) => {
      if (userId === readyDownload.userId) {
        return Promise.resolve(readyDownload);
      }
      return Promise.reject(new AppError({ message: "Download not found", code: "DOWNLOAD_NOT_FOUND", statusCode: 404 }));
    });

    const app = express();
    app.use(express.json());
    app.use(createMediaRoutes({ analyzeMediaService, verifyToken }));
    app.use(createDownloadRoutes({ createDownloadService, findDownloadService, mediaStorage, verifyToken }));
    app.use(errorHandlerMiddleware);
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", () => {
        resolve();
      });
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

  it("requires authentication for media analysis and queues downloads with the authenticated owner", async () => {
    const anonymous = await fetch(`${baseUrl}/media/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=example" }),
    });
    expect(anonymous.status).toBe(401);

    const analysisResponse = await fetch(`${baseUrl}/media/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "embaixador_session=owner-token" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=example" }),
    });
    expect(analysisResponse.status).toBe(200);
    await expect(readJson<{ options: typeof mediaOption[] }>(analysisResponse)).resolves.toMatchObject({ options: [mediaOption] });

    const downloadResponse = await fetch(`${baseUrl}/downloads`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "embaixador_session=owner-token" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=example", formatId: "format-720" }),
    });
    expect(downloadResponse.status).toBe(202);
    expect(createDownloadService.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-1", formatId: "format-720" }),
    );
    const queuedDownload = await readJson<Record<string, unknown>>(downloadResponse);
    expect(queuedDownload).not.toHaveProperty("sourceUrlCiphertext");
    expect(queuedDownload).not.toHaveProperty("sourceUrlIv");
    expect(queuedDownload).not.toHaveProperty("sourceUrlTag");
    expect(queuedDownload).not.toHaveProperty("userId");
  });

  it("scopes status lookup to the authenticated owner", async () => {
    const response = await fetch(`${baseUrl}/downloads/download-1`, {
      headers: { cookie: "embaixador_session=other-token" },
    });

    expect(response.status).toBe(404);
    expect(findDownloadService.execute).toHaveBeenCalledWith({ id: "download-1", userId: "other-owner" });
  });

  it("returns safe history metadata for the authenticated owner", async () => {
    const response = await fetch(`${baseUrl}/downloads/download-1`, {
      headers: { cookie: "embaixador_session=owner-token" },
    });

    expect(response.status).toBe(200);
    const download = await readJson<Record<string, unknown>>(response);
    expect(download).toMatchObject({ id: "download-1", platform: "YOUTUBE", status: "READY" });
    expect(download).not.toHaveProperty("sourceUrlCiphertext");
    expect(download).not.toHaveProperty("sourceUrlIv");
    expect(download).not.toHaveProperty("sourceUrlTag");
    expect(download).not.toHaveProperty("userId");
  });

  it("streams private media with no-store headers only for an owned, unexpired record", async () => {
    const response = await fetch(`${baseUrl}/downloads/download-1/file`, {
      headers: { cookie: "embaixador_session=owner-token" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe("private-media-content");
    expect(mediaStorage.getObjectStream).toHaveBeenCalledWith("owner-1/random-key");
  });

  it("denies file streaming when the record has expired", async () => {
    findDownloadService.execute.mockResolvedValueOnce({
      ...readyDownload,
      status: "READY",
      expiresAt: new Date("2026-10-07T00:00:00.000Z"),
    });

    const response = await fetch(`${baseUrl}/downloads/download-1/file`, {
      headers: { cookie: "embaixador_session=owner-token" },
    });

    expect(response.status).toBe(410);
    const body = await readJson<{ error: { code: string; requestId: string } }>(response);
    expect(body.error.code).toBe("MEDIA_UNAVAILABLE");
    expect(body.error.requestId.length).toBeGreaterThan(0);
    expect(mediaStorage.getObjectStream).not.toHaveBeenCalled();
  });
});