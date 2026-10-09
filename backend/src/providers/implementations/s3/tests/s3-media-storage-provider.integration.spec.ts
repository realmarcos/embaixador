import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { S3MediaStorageProvider } from "../s3-media-storage-provider";

const integrationEnabled = process.env.RUN_PROVIDER_INTEGRATION === "true" && Boolean(
  process.env.S3_TEST_BUCKET &&
  process.env.S3_ENDPOINT &&
  process.env.S3_REGION &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY,
);
const s3Client = integrationEnabled
  ? new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    })
  : null;

describe.skipIf(!integrationEnabled)("S3 media storage integration", () => {
  afterAll(() => {
    s3Client?.destroy();
  });

  it("uploads, streams, and deletes an object in the dedicated test bucket", async () => {
    if (!s3Client || !process.env.S3_TEST_BUCKET) throw new Error("S3 integration client was not initialized");
    const storage = new S3MediaStorageProvider(s3Client, process.env.S3_TEST_BUCKET);
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "s3-integration-"));
    const filePath = join(temporaryDirectory, "fixture.bin");
    const objectKey = `integration-tests/${randomUUID()}`;
    const contents = Buffer.from("private S3 integration fixture");

    try {
      await writeFile(filePath, contents);
      await storage.putObject({ objectKey, filePath, mimeType: "application/octet-stream" });
      const stream = await storage.getObjectStream(objectKey);
      let received = "";
      for await (const chunk of stream) received += Buffer.from(chunk).toString("utf8");
      expect(received).toBe(contents.toString("utf8"));
      await storage.deleteObject(objectKey);
      await expect(storage.getObjectStream(objectKey)).rejects.toMatchObject({ code: "MEDIA_OBJECT_NOT_FOUND" });
    } finally {
      await storage.deleteObject(objectKey);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});