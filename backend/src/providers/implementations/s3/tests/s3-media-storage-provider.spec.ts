import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { S3MediaStorageProvider } from "../s3-media-storage-provider";

describe("S3MediaStorageProvider", () => {
  const send = vi.fn();
  const client = { send } as unknown as S3Client;
  const provider = new S3MediaStorageProvider(client, "private-media-bucket");
  let temporaryDirectory: string;
  let mediaFilePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    temporaryDirectory = await mkdtemp(join(tmpdir(), "s3-provider-test-"));
    mediaFilePath = join(temporaryDirectory, "fixture.mp4");
    await writeFile(mediaFilePath, "private media fixture");
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("requires a configured bucket", () => {
    expect(() => new S3MediaStorageProvider(client, "  ")).toThrow("S3 bucket must be configured");
  });

  it.each(["", "/absolute/key", "../traversal", "media/../secret", "https://bucket/object"])(
    "rejects unsafe object keys before calling S3: %s",
    async (objectKey) => {
      await expect(provider.putObject({ objectKey, filePath: mediaFilePath, mimeType: "video/mp4" }))
        .rejects.toMatchObject({ code: "INVALID_MEDIA_OBJECT_KEY", statusCode: 400 });
      await expect(provider.getObjectStream(objectKey)).rejects.toMatchObject({ code: "INVALID_MEDIA_OBJECT_KEY" });
      await expect(provider.deleteObject(objectKey)).rejects.toMatchObject({ code: "INVALID_MEDIA_OBJECT_KEY" });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("uploads using the private bucket and server-side encryption", async () => {
    send.mockResolvedValueOnce({});

    await provider.putObject({ objectKey: "media/opaque-key", filePath: mediaFilePath, mimeType: "video/mp4" });

    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "private-media-bucket",
      Key: "media/opaque-key",
      ContentType: "video/mp4",
      ServerSideEncryption: "AES256",
    });
    expect(command.input.ACL).toBeUndefined();
  });

  it("maps upload failures without exposing provider details", async () => {
    send.mockRejectedValueOnce(new Error("secret S3 endpoint and credentials"));

    await expect(provider.putObject({
      objectKey: "media/opaque-key",
      filePath: mediaFilePath,
      mimeType: "video/mp4",
    })).rejects.toMatchObject({
      code: "MEDIA_STORAGE_WRITE_FAILED",
      statusCode: 502,
      message: "Unable to store this media right now",
    });
  });

  it("streams an object returned by the configured bucket", async () => {
    send.mockResolvedValueOnce({ Body: Readable.from(Buffer.from("private bytes")) });

    const stream = await provider.getObjectStream("media/opaque-key");
    let received = "";
    for await (const chunk of stream) received += Buffer.from(chunk).toString("utf8");

    expect(received).toBe("private bytes");
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect((send.mock.calls[0]?.[0] as GetObjectCommand).input).toEqual({
      Bucket: "private-media-bucket",
      Key: "media/opaque-key",
    });
  });

  it("maps missing objects and malformed provider bodies", async () => {
    send.mockRejectedValueOnce(Object.assign(new Error("not found"), { name: "NoSuchKey" }))
      .mockResolvedValueOnce({ Body: undefined })
      .mockResolvedValueOnce({ Body: Buffer.from("not a stream") });

    await expect(provider.getObjectStream("media/missing")).rejects.toMatchObject({
      code: "MEDIA_OBJECT_NOT_FOUND",
      statusCode: 404,
    });
    await expect(provider.getObjectStream("media/empty-body")).rejects.toMatchObject({
      code: "MEDIA_STORAGE_READ_FAILED",
      statusCode: 502,
    });
    await expect(provider.getObjectStream("media/invalid-body")).rejects.toMatchObject({
      code: "MEDIA_STORAGE_READ_FAILED",
      statusCode: 502,
    });
  });

  it("maps unexpected read errors without exposing raw details", async () => {
    send.mockRejectedValueOnce(new Error("private endpoint password"));

    await expect(provider.getObjectStream("media/opaque-key")).rejects.toMatchObject({
      code: "MEDIA_STORAGE_READ_FAILED",
      message: "Unable to retrieve this media right now",
    });
  });

  it("deletes an object and maps deletion failures safely", async () => {
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("private credentials"));

    await expect(provider.deleteObject("media/opaque-key")).resolves.toBeUndefined();
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((send.mock.calls[0]?.[0] as DeleteObjectCommand).input).toEqual({
      Bucket: "private-media-bucket",
      Key: "media/opaque-key",
    });
    await expect(provider.deleteObject("media/opaque-key")).rejects.toMatchObject({
      code: "MEDIA_STORAGE_WRITE_FAILED",
      statusCode: 502,
    });
  });
});