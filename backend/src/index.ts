import express from "express";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { config as loadDotEnv } from "dotenv";
import { S3Client } from "@aws-sdk/client-s3";
import { createAuthServiceFactory } from "./factories/auth/create-auth-service-factory";
import { createDownloadServiceFactory } from "./factories/downloads/create-download-service-factory";
import { createUserSettingsServiceFactory } from "./factories/settings/create-user-settings-service-factory";
import { createHistoryServiceFactory } from "./factories/history/create-history-service-factory";
import { loadEnvironment } from "./env";
import { PrismaDownloadRepository } from "./repositories/implementations/prisma/downloads";
import { createPrismaClient } from "./repositories/implementations/prisma/create-prisma-client";
import { errorHandlerMiddleware } from "./http/middlewares/error-handler-middleware";
import { createCorsMiddleware } from "./http/middlewares/cors-middleware";
import { createApiRouter } from "./http/routes";
import { S3MediaStorageProvider } from "./providers/implementations/s3/s3-media-storage-provider";
import { FfmpegMediaConverter } from "./providers/implementations/ffmpeg/ffmpeg-media-converter";
import { YtDlpMediaExtractor } from "./providers/implementations/yt-dlp/yt-dlp-media-extractor";
import { createSafeEgressProxy } from "./providers/implementations/yt-dlp/safe-egress-proxy";
import { resolvePublicDnsAddresses, ValidateMediaUrlService } from "./services/downloads/validate-media-url-service";
import { createSourceUrlDecryptor } from "./services/downloads/source-url-encryptor";
import { ExpireDownloadMediaService } from "./services/downloads/expire-download-media-service";
import { ProcessDownloadJobService } from "./services/downloads/process-download-job-service";
import { createDownloadCleanupWorker, createDownloadWorker } from "./workers/download-worker";

function requiredEnvironmentValue(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} must be configured`);
  }
  return value;
}

loadDotEnv();
const environment = loadEnvironment();
const databaseUrl = requiredEnvironmentValue(environment.databaseUrl, "DATABASE_URL");
const jwtSigningKey = requiredEnvironmentValue(environment.jwtSigningKey, "JWT_SIGNING_KEY");
const sourceUrlEncryptionKey = requiredEnvironmentValue(environment.sourceUrlEncryptionKey, "SOURCE_URL_ENCRYPTION_KEY");
const frontendOrigin = requiredEnvironmentValue(environment.frontendOrigin, "FRONTEND_ORIGIN");
const s3Region = requiredEnvironmentValue(environment.s3Region, "S3_REGION");
const s3Bucket = requiredEnvironmentValue(environment.s3Bucket, "S3_BUCKET");
const s3AccessKeyId = requiredEnvironmentValue(environment.s3AccessKeyId, "S3_ACCESS_KEY_ID");
const s3SecretAccessKey = requiredEnvironmentValue(environment.s3SecretAccessKey, "S3_SECRET_ACCESS_KEY");
const mediaTempDirectory = requiredEnvironmentValue(environment.mediaTempDirectory, "MEDIA_TEMP_DIRECTORY");
const ytDlpPath = requiredEnvironmentValue(environment.ytDlpPath, "YT_DLP_PATH");
const ffmpegPath = requiredEnvironmentValue(environment.ffmpegPath, "FFMPEG_PATH");

mkdirSync(mediaTempDirectory, { recursive: true });
const prisma = createPrismaClient({ databaseUrl });
const authServices = createAuthServiceFactory({ prisma, jwtSigningKey });
const urlValidator = new ValidateMediaUrlService({ resolveAddresses: resolvePublicDnsAddresses });
const egressProxy = createSafeEgressProxy({ resolveAddresses: resolvePublicDnsAddresses });
let egressProxyUrl: string | undefined;
const egressProxyReady = egressProxy.listen().then((url) => {
  egressProxyUrl = url;
});
const mediaExtractor = new YtDlpMediaExtractor({
  executablePath: ytDlpPath,
  urlValidator,
  proxyUrl: () => {
    if (!egressProxyUrl) {
      throw new Error("Media egress proxy is not ready");
    }
    return egressProxyUrl;
  },
});
const mediaConverter = new FfmpegMediaConverter({ executablePath: ffmpegPath });
const downloadServices = createDownloadServiceFactory({
  prisma,
  mediaExtractor,
  getAudioEncoderCapabilities: () => mediaConverter.getAudioEncoderCapabilities(),
  sourceUrlEncryptionKey,
});
const storageClient = new S3Client({
  region: s3Region,
  ...(environment.s3Endpoint ? { endpoint: environment.s3Endpoint, forcePathStyle: true } : {}),
  credentials: { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey },
});
const mediaStorage = new S3MediaStorageProvider(storageClient, s3Bucket);
const downloadRepository = new PrismaDownloadRepository(prisma);
const settingsServices = createUserSettingsServiceFactory(prisma);
const historyServices = createHistoryServiceFactory({
  prisma,
  mediaStorage,
  createDownloadService: downloadServices.createDownloadService,
  sourceUrlEncryptionKey,
});
const processDownloadJobService = new ProcessDownloadJobService({
  downloadRepository,
  mediaExtractor,
  mediaStorage,
  mediaConverter,
  decryptSourceUrl: createSourceUrlDecryptor(sourceUrlEncryptionKey),
  getRetentionHours: async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { retentionHours: true } });
    return user?.retentionHours ?? 1;
  },
  createTemporaryDirectory: () => mkdtemp(join(mediaTempDirectory, "download-")),
  removeTemporaryDirectory: (directory) => rm(directory, { recursive: true, force: true }),
  createObjectKey: () => `media/${randomUUID()}`,
  clock: () => new Date(),
});
const worker = createDownloadWorker({ downloadRepository, processDownloadJobService });
const cleanupWorker = createDownloadCleanupWorker({
  downloadRepository,
  expireDownloadMediaService: new ExpireDownloadMediaService({
    downloadRepository,
    mediaStorage,
    clock: () => new Date(),
  }),
});
const workerAbortController = new AbortController();

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(createCorsMiddleware(frontendOrigin));
app.use("/api", createApiRouter({
  auth: {
    ...authServices,
    nodeEnv: environment.nodeEnv,
  },
  media: { analyzeMediaService: downloadServices.analyzeMediaService, verifyToken: authServices.verifyToken },
  downloads: {
    createDownloadService: downloadServices.createDownloadService,
    findDownloadService: downloadServices.findDownloadService,
    mediaStorage,
    verifyToken: authServices.verifyToken,
  },
  settings: {
    getSettingsService: settingsServices.getUserSettingsService,
    updateSettingsService: settingsServices.updateUserSettingsService,
    verifyToken: authServices.verifyToken,
  },
  history: {
    ...historyServices,
    verifyToken: authServices.verifyToken,
  },
}));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use(errorHandlerMiddleware);

let server: ReturnType<typeof app.listen> | undefined;
void egressProxyReady.then(() => {
  if (workerAbortController.signal.aborted) return;
  void worker.run(workerAbortController.signal);
  void cleanupWorker.run(workerAbortController.signal);
  server = app.listen(environment.port, () => {
    console.log(`Server is running on http://localhost:${environment.port}`);
  });
}).catch(() => {
  storageClient.destroy();
  void prisma.$disconnect();
  console.error("Unable to initialize outbound media proxy");
  process.exitCode = 1;
});

function shutdown(): void {
  workerAbortController.abort();
  const closeDependencies = () => {
    storageClient.destroy();
    void prisma.$disconnect();
    void egressProxy.close();
  };
  if (server) {
    server.close(closeDependencies);
  } else {
    closeDependencies();
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);