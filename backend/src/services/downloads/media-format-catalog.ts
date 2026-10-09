import { MediaOption } from "../../providers/media-extractor/types";

type MediaPresetKind = "original" | "audio" | "video";

interface ResolvedMediaPreset {
  id: string;
  kind: MediaPresetKind;
  label: string;
  container: string;
  width: number | null;
  height: number | null;
  isOriginal: boolean;
  sourceFormatId: string;
  targetContainer: string | null;
  targetHeight: number | null;
  targetWidth: number | null;
  targetAudioOnly: boolean;
}

const videoPresets = [
  { id: "video-240p", label: "Vídeo 240p", height: 240 },
  { id: "video-360p", label: "Vídeo 360p", height: 360 },
  { id: "video-480p", label: "Vídeo 480p", height: 480 },
  { id: "video-720p", label: "Vídeo 720p", height: 720 },
  { id: "video-1080p", label: "Vídeo 1080p", height: 1080 },
  { id: "video-1440p", label: "Vídeo 1440p", height: 1440 },
  { id: "video-2k-dci", label: "Vídeo 2K (DCI)", height: 1080, width: 2048 },
  { id: "video-4k", label: "Vídeo 4K", height: 2160 },
] as const;

function firstAudioOption(options: MediaOption[]): MediaOption | undefined {
  return options.find((option) => option.hasAudio === true && option.hasVideo === false)
    ?? options.find((option) => option.hasAudio === true);
}

function originalOption(options: MediaOption[]): MediaOption | undefined {
  const muxed = options.find((option) => option.hasAudio === true && option.hasVideo === true);
  if (muxed) return muxed;

  const hasAudio = options.some((option) => option.hasAudio === true);
  const hasVideo = options.some((option) => option.hasVideo === true);
  if (hasAudio && hasVideo) return undefined;
  return options.find((option) => option.hasAudio === true || option.hasVideo === true);
}

function sourceFormatForVideo(video: MediaOption, audio: MediaOption | undefined): string {
  if (video.hasAudio === true || !audio) return video.id;
  return `${video.id}+${audio.id}`;
}

function buildMediaFormatCatalog(options: MediaOption[]): ResolvedMediaPreset[] {
  const presets: ResolvedMediaPreset[] = [];
  const original = originalOption(options);
  if (original) {
    presets.push({
      id: "original",
      kind: "original",
      label: "Original",
      container: original.container,
      width: original.width,
      height: original.height,
      isOriginal: true,
      sourceFormatId: original.id,
      targetContainer: null,
      targetHeight: null,
      targetWidth: null,
      targetAudioOnly: false,
    });
  }

  const audio = firstAudioOption(options);
  if (audio) {
    presets.push({
      id: "audio-mp3",
      kind: "audio",
      label: "Áudio MP3",
      container: "mp3",
      width: null,
      height: null,
      isOriginal: false,
      sourceFormatId: audio.id,
      targetContainer: "mp3",
      targetHeight: null,
      targetWidth: null,
      targetAudioOnly: true,
    });
    presets.push({
      id: "audio-mp4",
      kind: "audio",
      label: "Áudio MP4",
      container: "mp4",
      width: null,
      height: null,
      isOriginal: false,
      sourceFormatId: audio.id,
      targetContainer: "mp4",
      targetHeight: null,
      targetWidth: null,
      targetAudioOnly: true,
    });
  }

  const videoOptions = options
    .filter((option) => option.hasVideo === true && option.height !== null && option.width !== null)
    .slice()
    .sort((left, right) => {
      const audioPreference = Number(right.hasAudio === true) - Number(left.hasAudio === true);
      return audioPreference || (left.height ?? 0) - (right.height ?? 0);
    });

  for (const preset of videoPresets) {
    const source = videoOptions.find((option) => (option.height ?? 0) >= preset.height);
    if (!source) continue;

    const targetWidth = "width" in preset ? preset.width : null;

    presets.push({
      id: preset.id,
      kind: "video",
      label: preset.label,
      container: "mp4",
      width: targetWidth,
      height: preset.height,
      isOriginal: false,
      sourceFormatId: sourceFormatForVideo(source, audio),
      targetContainer: "mp4",
      targetHeight: preset.height,
      targetWidth,
      targetAudioOnly: false,
    });
  }

  return presets;
}

export { buildMediaFormatCatalog };
export type { ResolvedMediaPreset };
