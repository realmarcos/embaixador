import { PutMediaObjectInput, Readable } from "./types";

interface MediaStorageProvider {
  putObject(input: PutMediaObjectInput): Promise<void>;
  getObjectStream(objectKey: string): Promise<Readable>;
  deleteObject(objectKey: string): Promise<void>;
}

export { MediaStorageProvider };