import { Readable } from "node:stream";

interface PutMediaObjectInput {
  objectKey: string;
  filePath: string;
  mimeType: string;
}

export { PutMediaObjectInput, Readable };