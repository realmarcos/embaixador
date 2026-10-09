import { AppError } from "../../errors/app-errors";
import { MediaAnalysis, MediaOption } from "../../providers/media-extractor/types";
import { MediaExtractorProvider } from "../../providers/media-extractor";
import { ValidatedMediaUrl, ValidateMediaUrlService } from "./validate-media-url-service";

interface AnalyzeMediaServiceDependencies {
  urlValidator: Pick<ValidateMediaUrlService, "execute">;
  mediaExtractor: Pick<MediaExtractorProvider, "analyze">;
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
    message: "Unable to analyze this media right now",
    code: "MEDIA_ANALYSIS_FAILED",
    statusCode: 502,
  });
}

function mapAnalysis(validated: ValidatedMediaUrl, analysis: MediaAnalysis): MediaAnalysis {
  if (analysis.platform !== validated.platform || !Array.isArray(analysis.options)) {
    throw analysisFailed();
  }

  return {
    platform: validated.platform,
    title: safeTitle(analysis.title),
    thumbnailUrl: null,
    options: analysis.options.map(toPublicOption).filter((option) => option !== undefined),
  };
}

class AnalyzeMediaService {
  constructor(private readonly dependencies: AnalyzeMediaServiceDependencies) {}

  async execute(input: string): Promise<MediaAnalysis> {
    const validated = await this.dependencies.urlValidator.execute(input);
    let analysis: MediaAnalysis;

    try {
      analysis = await this.dependencies.mediaExtractor.analyze(validated.url);
    } catch {
      throw analysisFailed();
    }

    return mapAnalysis(validated, analysis);
  }
}

export { AnalyzeMediaService };