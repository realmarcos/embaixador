import {
  DownloadedMedia,
  MediaAnalysis,
  MediaDownloadRequest,
} from "./types";

interface MediaExtractorProvider {
  analyze(url: string): Promise<MediaAnalysis>;
  download(request: MediaDownloadRequest): Promise<DownloadedMedia>;
}

export { MediaExtractorProvider };