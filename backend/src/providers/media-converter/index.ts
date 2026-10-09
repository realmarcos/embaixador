import { DownloadedMedia } from "../media-extractor/types";

interface MediaConversionInput {
  filePath: string;
  fileName: string;
  mimeType: string;
  targetContainer: string;
  targetHeight: number | null;
  targetWidth?: number | null;
  targetAudioOnly?: boolean;
  outputDirectory: string;
}

interface MediaConverterProvider {
  convert(input: MediaConversionInput): Promise<DownloadedMedia>;
}

export { MediaConversionInput, MediaConverterProvider };