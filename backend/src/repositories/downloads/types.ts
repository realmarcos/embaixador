import { MediaPlatform } from "../../providers/media-extractor/types";

type DownloadStatus =
  | "QUEUED"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "MEDIA_DELETED"
  | "EXPIRED"
  | "DELETE_FAILED";

interface Download {
  id: string;
  userId: string;
  platform: MediaPlatform;
  sourceUrlCiphertext: string;
  sourceUrlIv: string;
  sourceUrlTag: string;
  sourceUrlKeyVersion: string;
  title: string | null;
  selectedFormatId: string;
  targetContainer: string | null;
  targetHeight: number | null;
  status: DownloadStatus;
  storageObjectKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: bigint | null;
  retentionHoursSnapshot: number | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  failureCode: string | null;
  replayOfId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateDownloadInput {
  userId: string;
  platform: MediaPlatform;
  sourceUrlCiphertext: string;
  sourceUrlIv: string;
  sourceUrlTag: string;
  sourceUrlKeyVersion: string;
  selectedFormatId: string;
  targetContainer?: string;
  targetHeight?: number;
  replayOfId?: string;
}

interface UpdateDownloadInput {
  id: string;
  status: DownloadStatus;
  title?: string | null;
  storageObjectKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: bigint | null;
  retentionHoursSnapshot?: number | null;
  completedAt?: Date | null;
  expiresAt?: Date | null;
  failureCode?: string | null;
}

export { CreateDownloadInput, Download, DownloadStatus, UpdateDownloadInput };