import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryMediaStorage } from "../../implementations/in-memory/media-storage";

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("InMemoryMediaStorage", () => {
  it("stores and streams an object only by its opaque key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "embaixador-storage-test-"));
    try {
      const filePath = join(directory, "media.mp4");
      const contents = Buffer.from("private-media-bytes");
      await writeFile(filePath, contents);
      const storage = new InMemoryMediaStorage();

      await storage.putObject({ objectKey: "owner-id/random-object-key", filePath, mimeType: "video/mp4" });

      await expect(readStream(await storage.getObjectStream("owner-id/random-object-key"))).resolves.toEqual(contents);
      await expect(storage.getObjectStream("https://public.example/object-key")).rejects.toMatchObject({
        code: "INVALID_MEDIA_OBJECT_KEY",
        statusCode: 400,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("treats repeated deletion as successful and idempotent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "embaixador-storage-test-"));
    try {
      const filePath = join(directory, "media.mp4");
      await writeFile(filePath, "private-media-bytes");
      const storage = new InMemoryMediaStorage();
      await storage.putObject({ objectKey: "random-object-key", filePath, mimeType: "video/mp4" });

      await expect(storage.deleteObject("random-object-key")).resolves.toBeUndefined();
      await expect(storage.deleteObject("random-object-key")).resolves.toBeUndefined();
      await expect(storage.getObjectStream("random-object-key")).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("maps local file read failures to a safe storage error", async () => {
    const storage = new InMemoryMediaStorage();

    await expect(
      storage.putObject({ objectKey: "random-object-key", filePath: "/path/that/does/not/exist", mimeType: "video/mp4" }),
    ).rejects.toMatchObject({ code: "MEDIA_STORAGE_WRITE_FAILED", statusCode: 502 });
  });

  it("rejects an empty media file as a safe storage failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "embaixador-storage-test-"));
    try {
      const filePath = join(directory, "empty.mp4");
      await writeFile(filePath, "");
      const storage = new InMemoryMediaStorage();

      await expect(storage.putObject({ objectKey: "empty-object", filePath, mimeType: "video/mp4" }))
        .rejects.toMatchObject({ code: "MEDIA_STORAGE_WRITE_FAILED", statusCode: 502 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});