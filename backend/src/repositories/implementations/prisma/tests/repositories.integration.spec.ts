import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaHistoryRepository } from "../history";
import { PrismaUserSettingsRepository } from "../settings";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationEnabled = process.env.RUN_PROVIDER_INTEGRATION === "true" && Boolean(testDatabaseUrl);
const prisma = integrationEnabled
  ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })
  : null;

describe.skipIf(!integrationEnabled)("Prisma repository integration", () => {
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("persists owner-scoped history and account settings in the isolated test database", async () => {
    if (!prisma) throw new Error("Prisma integration client was not initialized");
    const userId = randomUUID();
    const email = `integration-${userId}@example.test`;

    await prisma.user.create({
      data: {
        id: userId,
        name: "Integration Test",
        email,
        passwordHash: "test-only-hash",
      },
    });

    try {
      const download = await prisma.download.create({
        data: {
          userId,
          platform: "YOUTUBE",
          sourceUrlCiphertext: "test-ciphertext",
          sourceUrlIv: "test-iv",
          sourceUrlTag: "test-tag",
          sourceUrlKeyVersion: "v1",
          selectedFormatId: "test-format",
          selectedPresetId: "video-720p",
          targetContainer: "mp4",
          targetHeight: 720,
          targetWidth: null,
          targetAudioOnly: false,
          status: "QUEUED",
        },
      });
      const history = new PrismaHistoryRepository(prisma);
      const settings = new PrismaUserSettingsRepository(prisma);

      await expect(history.findByIdForOwner(download.id, userId)).resolves.toMatchObject({
        id: download.id,
        userId,
        status: "QUEUED",
        selectedPresetId: "video-720p",
        targetHeight: 720,
        targetAudioOnly: false,
      });
      await expect(history.findByIdForOwner(download.id, randomUUID())).resolves.toBeNull();
      await expect(history.findPage({ userId, cursor: null, limit: 10 })).resolves.toHaveLength(1);
      await expect(settings.updateByUserId(userId, { retentionHours: 24, themePreference: "DARK" }))
        .resolves.toEqual({ retentionHours: 24, themePreference: "DARK" });
    } finally {
      await prisma.download.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });
});