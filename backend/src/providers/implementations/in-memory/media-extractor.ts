import { DownloadedMedia, MediaAnalysis, MediaDownloadRequest } from "../../media-extractor/types";
import { MediaExtractorProvider } from "../../media-extractor";

interface InMemoryMediaAnalysis {
  url: string;
  result: MediaAnalysis;
}

interface InMemoryMediaDownload extends MediaDownloadRequest {
  result: DownloadedMedia;
}

class InMemoryMediaExtractor implements MediaExtractorProvider {
  private readonly analyses: Map<string, MediaAnalysis>;
  private readonly downloads: Map<string, DownloadedMedia>;

  constructor(analyses: InMemoryMediaAnalysis[] = [], downloads: InMemoryMediaDownload[] = []) {
    this.analyses = new Map(analyses.map(({ url, result }) => [url, result]));
    this.downloads = new Map(
      downloads.map((download) => [`${download.url}\u0000${download.formatId}`, download.result]),
    );
  }

  analyze(url: string): Promise<MediaAnalysis> {
    const entry = this.analyses.get(url);
    if (!entry) {
      return Promise.reject(new Error("No in-memory media analysis is configured for this URL"));
    }

    return Promise.resolve(structuredClone(entry));
  }

  download(request: MediaDownloadRequest): Promise<DownloadedMedia> {
    const result = this.downloads.get(`${request.url}\u0000${request.formatId}`);
    if (!result) {
      return Promise.reject(new Error("No in-memory media download is configured for this request"));
    }

    return Promise.resolve({ ...result });
  }
}

export { InMemoryMediaExtractor };