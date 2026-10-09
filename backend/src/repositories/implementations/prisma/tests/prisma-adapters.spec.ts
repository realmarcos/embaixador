import { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaDownloadRepository } from "../downloads";
import { PrismaHistoryRepository } from "../history";
import { PrismaUserSettingsRepository } from "../settings";
import { PrismaAccountRepository } from "../users";

const timestamp = new Date("2026-10-08T12:00:00.000Z");

function createDownload(overrides: Record<string, unknown> = {}) {
  return {
    id: "download-1",
    userId: "user-1",
    platform: "YOUTUBE" as const,
    sourceUrlCiphertext: "ciphertext",
    sourceUrlIv: "iv",
    sourceUrlTag: "tag",
    sourceUrlKeyVersion: "v1",
    title: null,
    selectedFormatId: "format-1",
    targetContainer: null,
    targetHeight: null,
    status: "QUEUED" as const,
    storageObjectKey: null,
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    retentionHoursSnapshot: null,
    completedAt: null,
    expiresAt: null,
    failureCode: null,
    replayOfId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function createUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.test",
    passwordHash: "test-hash",
    avatar: null,
    themePreference: "LIGHT" as const,
    retentionHours: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("PrismaDownloadRepository", () => {
  const download = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = { download } as unknown as PrismaClient;
  const repository = new PrismaDownloadRepository(prisma);

  beforeEach(() => vi.clearAllMocks());

  it("creates a queued row and maps it to the domain model", async () => {
    download.create.mockResolvedValue(createDownload());
    const input = {
      userId: "user-1",
      platform: "YOUTUBE" as const,
      sourceUrlCiphertext: "ciphertext",
      sourceUrlIv: "iv",
      sourceUrlTag: "tag",
      sourceUrlKeyVersion: "v1",
      selectedFormatId: "format-1",
    };

    await expect(repository.createQueued(input)).resolves.toMatchObject({ id: "download-1", status: "QUEUED" });
    expect(download.create).toHaveBeenCalledWith({
      data: {
        ...input,
        targetContainer: undefined,
        targetHeight: undefined,
        replayOfId: undefined,
        status: "QUEUED",
      },
    });
  });

  it("returns null when there is no queued job or another worker claims it", async () => {
    download.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(createDownload());
    download.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(repository.claimNextQueued()).resolves.toBeNull();
    await expect(repository.claimNextQueued()).resolves.toBeNull();
    expect(download.findUnique).not.toHaveBeenCalled();
  });

  it("returns a claimed job and handles a deleted row after the claim", async () => {
    download.findFirst.mockResolvedValue(createDownload());
    download.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    download.findUnique.mockResolvedValueOnce(createDownload({ status: "PROCESSING" })).mockResolvedValueOnce(null);

    await expect(repository.claimNextQueued()).resolves.toMatchObject({ status: "PROCESSING" });
    await expect(repository.claimNextQueued()).resolves.toBeNull();
    expect(download.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "download-1", status: "QUEUED" },
      data: { status: "PROCESSING" },
    }));
  });

  it("selects expired and retryable rows using an inclusive deadline", async () => {
    download.findMany.mockResolvedValue([createDownload({ status: "READY", expiresAt: timestamp })]);

    await expect(repository.findExpiredForCleanup(timestamp, 7)).resolves.toMatchObject([{ id: "download-1" }]);
    expect(download.findMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lte: timestamp },
        OR: [
          { status: "READY" },
          { status: "DELETE_FAILED", storageObjectKey: { not: null } },
        ],
      },
      orderBy: { expiresAt: "asc" },
      take: 7,
    });
  });

  it("looks up by both ID and owner and maps a missing row to null", async () => {
    download.findFirst.mockResolvedValueOnce(createDownload()).mockResolvedValueOnce(null);

    await expect(repository.findByIdForOwner("download-1", "user-1")).resolves.toMatchObject({ id: "download-1" });
    await expect(repository.findByIdForOwner("download-1", "other-user")).resolves.toBeNull();
    expect(download.findFirst).toHaveBeenNthCalledWith(2, { where: { id: "download-1", userId: "other-user" } });
  });

  it("updates a row and maps all persisted fields", async () => {
    download.update.mockResolvedValue(createDownload({ status: "FAILED", failureCode: "MEDIA_DOWNLOAD_FAILED" }));

    await expect(repository.update({ id: "download-1", status: "FAILED", failureCode: "MEDIA_DOWNLOAD_FAILED" }))
      .resolves.toMatchObject({ status: "FAILED", failureCode: "MEDIA_DOWNLOAD_FAILED" });
    expect(download.update).toHaveBeenCalledWith({
      where: { id: "download-1" },
      data: { status: "FAILED", failureCode: "MEDIA_DOWNLOAD_FAILED" },
    });
  });
});

describe("PrismaHistoryRepository", () => {
  const download = {
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const repository = new PrismaHistoryRepository({ download } as unknown as PrismaClient);

  beforeEach(() => vi.clearAllMocks());

  it("paginates owner history with and without a composite cursor", async () => {
    download.findMany.mockResolvedValue([createDownload()]);
    const cursor = { id: "download-0", createdAt: timestamp };

    await expect(repository.findPage({ userId: "user-1", cursor: null, limit: 20 })).resolves.toHaveLength(1);
    await expect(repository.findPage({ userId: "user-1", cursor, limit: 10 })).resolves.toHaveLength(1);
    expect(download.findMany).toHaveBeenNthCalledWith(1, {
      where: { userId: "user-1" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    expect(download.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: "user-1",
        OR: [
          { createdAt: { lt: timestamp } },
          { createdAt: timestamp, id: { lt: "download-0" } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    });
  });

  it("owner-scopes lookups, all-record retrieval, and deletes", async () => {
    download.findFirst.mockResolvedValueOnce(createDownload()).mockResolvedValueOnce(null);
    download.findMany.mockResolvedValue([createDownload()]);
    download.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 2 });

    await expect(repository.findByIdForOwner("download-1", "user-1")).resolves.toMatchObject({ id: "download-1" });
    await expect(repository.findByIdForOwner("download-1", "user-2")).resolves.toBeNull();
    await expect(repository.findAllForOwner("user-1")).resolves.toHaveLength(1);
    await expect(repository.deleteByIdForOwner("download-1", "user-1")).resolves.toBe(true);
    await expect(repository.deleteByIdForOwner("download-1", "user-2")).resolves.toBe(false);
    await expect(repository.deleteAllForOwner("user-1")).resolves.toBeUndefined();
    expect(download.deleteMany).toHaveBeenLastCalledWith({ where: { userId: "user-1" } });
  });
});

describe("PrismaUserSettingsRepository", () => {
  const user = { findUnique: vi.fn(), update: vi.fn() };
  const repository = new PrismaUserSettingsRepository({ user } as unknown as PrismaClient);

  beforeEach(() => vi.clearAllMocks());

  it("maps absent/default and persisted settings", async () => {
    user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ themePreference: "LIGHT", retentionHours: 1 });

    await expect(repository.findByUserId("missing")).resolves.toBeNull();
    await expect(repository.findByUserId("user-1")).resolves.toEqual({ themePreference: "LIGHT", retentionHours: 1 });
  });

  it("rejects invalid persisted retention or theme values", async () => {
    user.findUnique.mockResolvedValueOnce({ themePreference: "LIGHT", retentionHours: 2 })
      .mockResolvedValueOnce({ themePreference: "SEPIA", retentionHours: 1 });

    await expect(repository.findByUserId("user-1")).rejects.toThrow("Persisted user settings");
    await expect(repository.findByUserId("user-1")).rejects.toThrow("Persisted user settings");
  });

  it("owner-scopes settings updates and maps missing and unexpected errors", async () => {
    user.update.mockResolvedValueOnce({ themePreference: "DARK", retentionHours: 24 })
      .mockRejectedValueOnce({ code: "P2025" })
      .mockRejectedValueOnce(new Error("database failure"));

    await expect(repository.updateByUserId("user-1", { themePreference: "DARK", retentionHours: 24 }))
      .resolves.toEqual({ themePreference: "DARK", retentionHours: 24 });
    await expect(repository.updateByUserId("missing", { retentionHours: 8 })).resolves.toBeNull();
    await expect(repository.updateByUserId("user-1", { retentionHours: 8 })).rejects.toThrow("database failure");
    expect(user.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: "user-1" } }));
  });
});

describe("PrismaAccountRepository", () => {
  const user = { create: vi.fn(), findUnique: vi.fn() };
  const repository = new PrismaAccountRepository({ user } as unknown as PrismaClient);

  beforeEach(() => vi.clearAllMocks());

  it("maps nullable avatar, finds by ID/email, and normalizes email", async () => {
    user.findUnique.mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createUser())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createUser({ avatar: "avatar" }));

    await expect(repository.findById("missing")).resolves.toBeNull();
    await expect(repository.findById("user-1")).resolves.toMatchObject({ avatar: "" });
    await expect(repository.findByNormalizedEmail("missing@example.test")).resolves.toBeNull();
    await expect(repository.findByNormalizedEmail(" TEST@EXAMPLE.TEST ")).resolves.toMatchObject({ avatar: "avatar" });
    expect(user.findUnique).toHaveBeenLastCalledWith({ where: { email: "test@example.test" } });
  });

  it("rejects unsupported persisted retention and creates an account", async () => {
    user.findUnique.mockResolvedValueOnce(createUser({ retentionHours: 2 }));
    user.create.mockResolvedValueOnce(createUser());

    await expect(repository.findById("user-1")).rejects.toThrow("retentionHours");
    await expect(repository.createAccount({
      name: "Test User",
      email: "test@example.test",
      avatar: "",
      passwordHash: "test-hash",
      themePreference: "LIGHT",
      retentionHours: 1,
    })).resolves.toMatchObject({ id: "user-1", retentionHours: 1 });
  });
});