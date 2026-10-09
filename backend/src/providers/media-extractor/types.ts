type MediaPlatform = "YOUTUBE" | "INSTAGRAM" | "FACEBOOK";

interface MediaOption {
  id: string;
  container: string;
  width: number | null;
  height: number | null;
  qualityLabel: string | null;
  isOriginal: boolean;
}

interface MediaAnalysis {
  platform: MediaPlatform;
  title: string | null;
  thumbnailUrl: string | null;
  options: MediaOption[];
}

interface MediaDownloadRequest {
  url: string;
  formatId: string;
  outputDirectory: string;
}

interface DownloadedMedia {
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export { DownloadedMedia, MediaAnalysis, MediaDownloadRequest, MediaOption, MediaPlatform };