import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { serializeApiError } from "../../../errors/app-errors";
import { createCorsMiddleware } from "../../../http/middlewares/cors-middleware";
import { InMemoryDownloadRepository } from "../../../repositories/implementations/in-memory/downloads";
import { InMemoryHistoryRepository } from "../../../repositories/implementations/in-memory/history";
import { isPublicAddress, ValidateMediaUrlService } from "../validate-media-url-service";

const ownedRecord = {
  id: "owned-download",
  userId: "owner-1",
  platform: "YOUTUBE" as const,
  sourceUrlCiphertext: "ciphertext",
  sourceUrlIv: "iv",
  sourceUrlTag: "tag",
  sourceUrlKeyVersion: "v1",
  title: null,
  selectedFormatId: "format-720",
  selectedPresetId: null,
  targetContainer: null,
  targetHeight: null,
  targetWidth: null,
  targetAudioOnly: false,
  status: "READY" as const,
  storageObjectKey: "media/private-object",
  fileName: "video.mp4",
  mimeType: "video/mp4",
  sizeBytes: BigInt(12),
  retentionHoursSnapshot: 1,
  completedAt: new Date("2026-10-07T12:00:00.000Z"),
  expiresAt: new Date("2026-10-08T12:00:00.000Z"),
  failureCode: null,
  replayOfId: null,
  createdAt: new Date("2026-10-07T12:00:00.000Z"),
  updatedAt: new Date("2026-10-07T12:00:00.000Z"),
};

describe("security boundaries", () => {
  it.each([
    ["8.8.8.8", true],
    ["0.0.0.0", false],
    ["100.64.0.1", false],
    ["192.0.2.1", false],
    ["198.51.100.1", false],
    ["203.0.113.1", false],
    ["224.0.0.1", false],
    ["255.255.255.255", false],
    ["1.2.3", false],
    ["256.1.1.1", false],
    ["2606:4700:4700::1111", true],
    ["2001:db8::1", false],
    ["2001:0::1", false],
    ["2002::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:8.8.8.8", false],
    ["2001:::1", false],
    ["not-an-ip", false],
  ] as const)("classifies address %s as public=%s", (address, isPublic) => {
    expect(isPublicAddress(address)).toBe(isPublic);
  });

  it.each([
    "http://127.0.0.1/private",
    "http://10.1.2.3/private",
    "http://172.16.0.1/private",
    "http://192.168.1.1/private",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/private",
    "https://youtube.com@127.0.0.1/video",
  ])("rejects private or deceptive URL target %s", async (url) => {
    const validator = new ValidateMediaUrlService();

    await expect(validator.execute(url)).rejects.toMatchObject({ code: "INVALID_MEDIA_URL", statusCode: 400 });
  });

  it("rejects an allowlisted hostname that resolves to a private or link-local address", async () => {
    const validator = new ValidateMediaUrlService({
      resolveAddresses: () => Promise.resolve(["8.8.8.8", "169.254.169.254"]),
    });

    await expect(validator.execute("https://www.youtube.com/watch?v=example"))
      .rejects.toMatchObject({ code: "INVALID_MEDIA_URL", statusCode: 400 });
  });

  it("allows an allowlisted hostname only when every DNS answer is public", async () => {
    const validator = new ValidateMediaUrlService({
      resolveAddresses: () => Promise.resolve(["8.8.8.8", "2606:4700:4700::1111"]),
    });

    await expect(validator.execute("https://www.youtube.com/watch?v=example"))
      .resolves.toMatchObject({ platform: "YOUTUBE" });
  });

  it("permits credentialed CORS only for the exact configured Origin", () => {
    const frontendOrigin = "https://app.example";
    const response = {
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        response.headers[name.toLowerCase()] = value;
        return response;
      },
      status: vi.fn().mockReturnThis(),
      end: vi.fn(),
    } as unknown as Response & { headers: Record<string, string> };
    const allowedRequest = {
      method: "GET",
      headers: { origin: frontendOrigin },
      get: (name: string) => name.toLowerCase() === "origin" ? frontendOrigin : undefined,
    } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;

    createCorsMiddleware(frontendOrigin)(allowedRequest, response, next);

    expect(response.headers["access-control-allow-origin"]).toBe(frontendOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(next).toHaveBeenCalledOnce();
  });

  it("serializes untrusted provider failures without URLs, credentials, or stack details", () => {
    const serialized = serializeApiError(
      new Error("https://youtube.com/private?token=secret database-password"),
      "request-id",
    );

    expect(serialized.statusCode).toBe(500);
    expect(JSON.stringify(serialized.body)).not.toContain("youtube.com");
    expect(JSON.stringify(serialized.body)).not.toContain("secret");
    expect(JSON.stringify(serialized.body)).not.toContain("password");
  });

  it("never returns another account's history record", async () => {
    const downloads = new InMemoryDownloadRepository([ownedRecord]);
    const history = new InMemoryHistoryRepository(downloads);

    await expect(history.findByIdForOwner("owned-download", "other-owner")).resolves.toBeNull();
    await expect(history.findPage({ userId: "other-owner", cursor: null, limit: 10 })).resolves.toEqual([]);
    await expect(history.deleteByIdForOwner("owned-download", "other-owner")).resolves.toBe(false);
    expect(downloads.downloads).toHaveLength(1);
  });
});