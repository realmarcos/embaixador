import { DownloadedMedia } from "../media-extractor/types";

interface AudioEncoderCapabilities {
  mp3: boolean;
  mp4: boolean;
}

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
  getAudioEncoderCapabilities(): Promise<AudioEncoderCapabilities>;
}

export { AudioEncoderCapabilities, MediaConversionInput, MediaConverterProvider };