import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { AppError } from "../../../errors/app-errors";
import { MediaStorageProvider } from "../../media-storage";
import { PutMediaObjectInput } from "../../media-storage/types";

interface StoredMediaObject {
  contents: Buffer;
  mimeType: string;
}

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

class InMemoryMediaStorage implements MediaStorageProvider {
  private readonly objects = new Map<string, StoredMediaObject>();

  async putObject(input: PutMediaObjectInput): Promise<void> {
    validateObjectKey(input.objectKey);

    try {
      const contents = await readFile(input.filePath);
      if (contents.length === 0) {
        throw new Error("Empty media object");
      }

      this.objects.set(input.objectKey, { contents: Buffer.from(contents), mimeType: input.mimeType });
    } catch {
      throw new AppError({
        message: "Unable to store this media right now",
        code: "MEDIA_STORAGE_WRITE_FAILED",
        statusCode: 502,
      });
    }
  }

  getObjectStream(objectKey: string): Promise<Readable> {
    return Promise.resolve().then(() => {
      validateObjectKey(objectKey);
      const storedObject = this.objects.get(objectKey);
      if (!storedObject) {
        throw new AppError({
          message: "Media not found",
          code: "MEDIA_OBJECT_NOT_FOUND",
          statusCode: 404,
        });
      }

      return Readable.from(Buffer.from(storedObject.contents));
    });
  }

  deleteObject(objectKey: string): Promise<void> {
    return Promise.resolve().then(() => {
      validateObjectKey(objectKey);
      this.objects.delete(objectKey);
    });
  }
}

export { InMemoryMediaStorage };