import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryDownloadRepository } from "../../../repositories/implementations/in-memory/downloads";
import { ValidateMediaUrlService } from "../validate-media-url-service";
import { CreateDownloadService } from "../create-download-service";
import { FindDownloadService } from "../find-download-service";

const analysis = {
  analysis: {
    platform: "YOUTUBE" as const,
    title: "Safe title",
    thumbnailUrl: null,
    options: [
      {
        id: "video-720p",
        kind: "video" as const,
        label: "Vídeo 720p",
        container: "mp4",
        width: null,
        height: 720,
        isOriginal: false,
      },
    ],
  },
  presets: [
    {
      id: "video-720p",
      kind: "video" as const,
      label: "Vídeo 720p",
      container: "mp4",
      width: null,
      height: 720,
      isOriginal: false,
      sourceFormatId: "format-720",
      targetContainer: "mp4",
      targetHeight: 720,
      targetWidth: null,
      targetAudioOnly: false,
    },
  ],
};

describe("CreateDownloadService", () => {
  let downloadRepository: InMemoryDownloadRepository;
  const analyzeMediaService = { executeWithCatalog: vi.fn() };
  const encryptSourceUrl = vi.fn();
  const urlValidator = new ValidateMediaUrlService();
  let service: CreateDownloadService;

  beforeEach(() => {
    vi.clearAllMocks();
    downloadRepository = new InMemoryDownloadRepository();
    analyzeMediaService.executeWithCatalog.mockResolvedValue(analysis);
    encryptSourceUrl.mockReturnValue({
      ciphertext: "ciphertext",
      iv: "iv",
      tag: "tag",
      keyVersion: "v1",
    });
    service = new CreateDownloadService({ downloadRepository, urlValidator, analyzeMediaService, encryptSourceUrl });
  });

  it("revalidates the preset and persists only its internal selection and encrypted source URL", async () => {
    const result = await service.execute({
      userId: "owner-1",
      sourceUrl: "https://www.youtube.com/watch?v=example",
      presetId: "video-720p",
    });

    expect(analyzeMediaService.executeWithCatalog).toHaveBeenCalledWith("https://www.youtube.com/watch?v=example");
    expect(encryptSourceUrl).toHaveBeenCalledWith("https://www.youtube.com/watch?v=example");
    expect(result.status).toBe("QUEUED");
    expect(downloadRepository.downloads).toHaveLength(1);
    expect(downloadRepository.downloads[0]).toMatchObject({
      userId: "owner-1",
      platform: "YOUTUBE",
      sourceUrlCiphertext: "ciphertext",
      sourceUrlIv: "iv",
      sourceUrlTag: "tag",
      sourceUrlKeyVersion: "v1",
      selectedPresetId: "video-720p",
      selectedFormatId: "format-720",
      targetContainer: "mp4",
      targetHeight: 720,
      targetWidth: null,
      targetAudioOnly: false,
      status: "QUEUED",
    });
    expect(downloadRepository.downloads[0]).not.toHaveProperty("sourceUrl");
  });

  it.each([{ presetId: "not-offered" }])("rejects a preset absent from fresh analysis", async (selection) => {
    await expect(
      service.execute({ userId: "owner-1", sourceUrl: "https://www.youtube.com/watch?v=example", ...selection }),
    ).rejects.toMatchObject({ code: "FORMAT_NOT_AVAILABLE", statusCode: 422 });
    expect(downloadRepository.downloads).toHaveLength(0);
  });

  it("re-resolves a legacy history selection only when source and conversion still match", async () => {
    const result = await service.execute({
      userId: "owner-1",
      sourceUrl: "https://www.youtube.com/watch?v=example",
      legacyFormatId: "format-720",
      legacyTargetContainer: "mp4",
      legacyTargetHeight: 720,
    });

    expect(result).toMatchObject({
      selectedPresetId: "video-720p",
      selectedFormatId: "format-720",
      targetContainer: "mp4",
      targetHeight: 720,
    });
  });

  it("maps repository failures to a safe creation error", async () => {
    const failingRepository = {
      createQueued: vi.fn().mockRejectedValue(new Error("db-password=secret")),
    };
    const failingService = new CreateDownloadService({
      downloadRepository: failingRepository,
      urlValidator,
      analyzeMediaService,
      encryptSourceUrl,
    });

    let caughtError: unknown;
    try {
      await failingService.execute({
        userId: "owner-1",
        sourceUrl: "https://www.youtube.com/watch?v=example",
        presetId: "video-720p",
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({ code: "DOWNLOAD_CREATION_FAILED", statusCode: 500 });
    expect(String(caughtError)).not.toContain("db-password");
  });
});

describe("FindDownloadService", () => {
  let downloadRepository: InMemoryDownloadRepository;
  let service: FindDownloadService;

  beforeEach(() => {
    downloadRepository = new InMemoryDownloadRepository();
    service = new FindDownloadService({ downloadRepository });
  });

  it("uses the authenticated owner for status lookups", async () => {
    const queuedDownload = await downloadRepository.createQueued({
      userId: "owner-1",
      platform: "YOUTUBE",
      sourceUrlCiphertext: "ciphertext",
      sourceUrlIv: "iv",
      sourceUrlTag: "tag",
      sourceUrlKeyVersion: "v1",
      selectedFormatId: "format-720",
    });

    await expect(service.execute({ id: queuedDownload.id, userId: "owner-1" })).resolves.toEqual(queuedDownload);
  });

  it("returns not found for absent or other-owner downloads", async () => {
    const queuedDownload = await downloadRepository.createQueued({
      userId: "owner-1",
      platform: "YOUTUBE",
      sourceUrlCiphertext: "ciphertext",
      sourceUrlIv: "iv",
      sourceUrlTag: "tag",
      sourceUrlKeyVersion: "v1",
      selectedFormatId: "format-720",
    });

    await expect(service.execute({ id: queuedDownload.id, userId: "other-owner" })).rejects.toMatchObject({
      code: "DOWNLOAD_NOT_FOUND",
      statusCode: 404,
    });
  });
});