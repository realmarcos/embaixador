import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { AppError } from "../../../errors/app-errors";
import { MediaStorageProvider } from "../../media-storage";
import { PutMediaObjectInput } from "../../media-storage/types";

function invalidObjectKeyError(): AppError {
  return new AppError({
    message: "Invalid media object key",
    code: "INVALID_MEDIA_OBJECT_KEY",
    statusCode: 400,
  });
}

function validateObjectKey(objectKey: string): void {
  if (
    objectKey.length === 0 ||
    objectKey.length > 512 ||
    objectKey.startsWith("/") ||
    objectKey.includes("..") ||
    objectKey.includes("://")
  ) {
    throw invalidObjectKeyError();
  }
}

function storageError(operation: "read" | "write" | "delete"): AppError {
  const isRead = operation === "read";
  return new AppError({
    message: isRead ? "Unable to retrieve this media right now" : "Unable to store this media right now",
    code: isRead ? "MEDIA_STORAGE_READ_FAILED" : "MEDIA_STORAGE_WRITE_FAILED",
    statusCode: 502,
  });
}

class S3MediaStorageProvider implements MediaStorageProvider {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {
    if (bucket.trim().length === 0) {
      throw new Error("S3 bucket must be configured");
    }
  }

  async putObject(input: PutMediaObjectInput): Promise<void> {
    validateObjectKey(input.objectKey);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.objectKey,
          Body: createReadStream(input.filePath),
          ContentType: input.mimeType,
          ServerSideEncryption: "AES256",
        }),
      );
    } catch {
      throw storageError("write");
    }
  }

  async getObjectStream(objectKey: string): Promise<Readable> {
    validateObjectKey(objectKey);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      if (!result.Body || !(result.Body instanceof Readable)) {
        throw storageError("read");
      }
      return result.Body;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (typeof error === "object" && error !== null && "name" in error && error.name === "NoSuchKey") {
        throw new AppError({
          message: "Media not found",
          code: "MEDIA_OBJECT_NOT_FOUND",
          statusCode: 404,
        });
      }
      throw storageError("read");
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    validateObjectKey(objectKey);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
    } catch {
      throw storageError("delete");
    }
  }
}

export { S3MediaStorageProvider };