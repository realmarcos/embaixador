import { AppError } from "../../errors/app-errors";
import { MediaAnalysis, MediaOption, MediaPreset, MediaPresetAnalysis } from "../../providers/media-extractor/types";
import { MediaExtractorProvider } from "../../providers/media-extractor";
import { AudioEncoderCapabilities } from "../../providers/media-converter";
import { ValidatedMediaUrl, ValidateMediaUrlService } from "./validate-media-url-service";
import { buildMediaFormatCatalog, ResolvedMediaPreset } from "./media-format-catalog";

interface AnalyzeMediaServiceDependencies {
  urlValidator: Pick<ValidateMediaUrlService, "execute">;
  mediaExtractor: Pick<MediaExtractorProvider, "analyze">;
  getAudioEncoderCapabilities: () => Promise<AudioEncoderCapabilities>;
}

function isValidDimension(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value >= 1 && value <= 8640);
}

function toPublicOption(option: MediaOption): MediaOption | undefined {
  if (
    typeof option.id !== "string" ||
    option.id.length === 0 ||
    option.id.length > 128 ||
    typeof option.container !== "string" ||
    !/^[a-z0-9]{1,16}$/i.test(option.container) ||
    !isValidDimension(option.width) ||
    !isValidDimension(option.height) ||
    (option.qualityLabel !== null && option.qualityLabel.length > 80)
  ) {
    return undefined;
  }

  return {
    id: option.id,
    container: option.container.toLowerCase(),
    width: option.width,
    height: option.height,
    qualityLabel: option.qualityLabel,
    isOriginal: option.isOriginal,
    hasAudio: option.hasAudio === true,
    hasVideo: option.hasVideo === true,
  };
}

function safeTitle(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const title = value
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 512);
  return title.length > 0 ? title : null;
}

function analysisFailed(): AppError {
  return new AppError({
    message: "Unable to analyze this media. Check that the link is public; ask the administrator to check the analyzer and connection.",
    code: "MEDIA_ANALYSIS_FAILED",
    statusCode: 502,
    exposeMessage: true,
  });
}

interface AnalyzedMediaWithCatalog {
  analysis: MediaPresetAnalysis;
  presets: ResolvedMediaPreset[];
}

function toPublicPreset(preset: ResolvedMediaPreset): MediaPreset {
  return {
    id: preset.id,
    kind: preset.kind,
    label: preset.label,
    container: preset.container,
    width: preset.width,
    height: preset.height,
    isOriginal: preset.isOriginal,
  };
}

function mapAnalysis(
  validated: ValidatedMediaUrl,
  analysis: MediaAnalysis,
  audioEncoders: AudioEncoderCapabilities,
): AnalyzedMediaWithCatalog {
  const options = analysis.options.map(toPublicOption).filter((option) => option !== undefined);
  const presets = buildMediaFormatCatalog(options, audioEncoders);

  return {
    analysis: {
      platform: validated.platform,
      title: safeTitle(analysis.title),
      thumbnailUrl: null,
      options: presets.map(toPublicPreset),
    },
    presets,
  };
}

class AnalyzeMediaService {
  constructor(private readonly dependencies: AnalyzeMediaServiceDependencies) {}

  async executeWithCatalog(input: string): Promise<AnalyzedMediaWithCatalog> {
    const validated = await this.dependencies.urlValidator.execute(input);
    let analysis: MediaAnalysis;

    try {
      analysis = await this.dependencies.mediaExtractor.analyze(validated.url);
    } catch (error) {
      if (error instanceof AppError && error.exposeMessage) {
        throw error;
      }
      throw analysisFailed();
    }

    if (analysis.platform !== validated.platform || !Array.isArray(analysis.options)) {
      throw analysisFailed();
    }
    const hasAnalyzedAudio = analysis.options.some((option) => option.hasAudio === true);
    const audioEncoders = hasAnalyzedAudio
      ? await this.dependencies.getAudioEncoderCapabilities()
      : { mp3: false, mp4: false };
    return mapAnalysis(validated, analysis, audioEncoders);
  }

  async execute(input: string): Promise<MediaPresetAnalysis> {
    return (await this.executeWithCatalog(input)).analysis;
  }
}

export { AnalyzeMediaService };