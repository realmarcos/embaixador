import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryDownloadRepository } from "../../../repositories/implementations/in-memory/downloads";
import { InMemoryMediaExtractor } from "../../../providers/implementations/in-memory/media-extractor";
import { InMemoryMediaStorage } from "../../../providers/implementations/in-memory/media-storage";
import { ProcessDownloadJobService } from "../process-download-job-service";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ProcessDownloadJobService with in-memory adapters", () => {
  it("moves an owned queued download through processing to private READY media with a retention snapshot", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "embaixador-job-input-"));
    directories.push(sourceDirectory);
    const sourceFile = join(sourceDirectory, "source.mp4");
    const contents = Buffer.from("authorized-media-bytes");
    await writeFile(sourceFile, contents);

    const downloadRepository = new InMemoryDownloadRepository();
    const queued = await downloadRepository.createQueued({
      userId: "owner-1",
      platform: "YOUTUBE",
      sourceUrlCiphertext: "ciphertext",
      sourceUrlIv: "iv",
      sourceUrlTag: "tag",
      sourceUrlKeyVersion: "v1",
      selectedFormatId: "format-720",
    });
    const processing = await downloadRepository.claimNextQueued();
    const mediaExtractor = new InMemoryMediaExtractor([], [
      {
        url: "https://www.youtube.com/watch?v=video-id",
        formatId: "format-720",
        outputDirectory: "/unused-by-fake",
        result: {
          filePath: sourceFile,
          fileName: "source.mp4",
          mimeType: "video/mp4",
          sizeBytes: contents.length,
        },
      },
    ]);
    const mediaStorage = new InMemoryMediaStorage();
    const mediaConverter = { convert: vi.fn() };
    const completedAt = new Date("2026-10-07T12:00:00.000Z");
    const service = new ProcessDownloadJobService({
      downloadRepository,
      mediaExtractor,
      mediaStorage,
      mediaConverter,
      decryptSourceUrl: () => "https://www.youtube.com/watch?v=video-id",
      getRetentionHours: () => Promise.resolve(24),
      createTemporaryDirectory: () => Promise.resolve("/private/job-temp"),
      removeTemporaryDirectory: () => Promise.resolve(),
      createObjectKey: () => "owner-1/private-media-key",
      clock: () => completedAt,
    });

    if (!processing) {
      throw new Error("Expected the in-memory repository to claim the queued download");
    }
    const ready = await service.execute(processing);

    expect(queued.status).toBe("QUEUED");
    expect(processing.status).toBe("PROCESSING");
    expect(ready).toMatchObject({
      id: queued.id,
      userId: "owner-1",
      status: "READY",
      retentionHoursSnapshot: 24,
      expiresAt: new Date(completedAt.getTime() + 24 * 60 * 60 * 1000),
    });
    await expect(
      mediaStorage.getObjectStream("owner-1/private-media-key").then(async (stream) => {
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      }),
    ).resolves.toEqual(contents);
    expect(mediaConverter.convert).not.toHaveBeenCalled();
  });
});