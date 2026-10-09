type MediaPlatform = "YOUTUBE" | "INSTAGRAM" | "FACEBOOK";
type MediaPresetKind = "original" | "audio" | "video";

interface MediaOption {
  id: string;
  container: string;
  width: number | null;
  height: number | null;
  qualityLabel: string | null;
  isOriginal: boolean;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

interface MediaAnalysis {
  platform: MediaPlatform;
  title: string | null;
  thumbnailUrl: string | null;
  options: MediaOption[];
}

interface MediaPreset {
  id: string;
  kind: MediaPresetKind;
  label: string;
  container: string;
  width: number | null;
  height: number | null;
  isOriginal: boolean;
}

interface MediaPresetAnalysis {
  platform: MediaPlatform;
  title: string | null;
  thumbnailUrl: string | null;
  options: MediaPreset[];
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

export {
  DownloadedMedia,
  MediaAnalysis,
  MediaDownloadRequest,
  MediaOption,
  MediaPlatform,
  MediaPreset,
  MediaPresetAnalysis,
  MediaPresetKind,
};