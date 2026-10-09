import { setTimeout as delay } from "node:timers/promises";
import { DownloadRepository } from "../repositories/downloads";
import { ExpireDownloadMediaService } from "../services/downloads/expire-download-media-service";
import { ProcessDownloadJobService } from "../services/downloads/process-download-job-service";

interface CreateDownloadWorkerInput {
  downloadRepository: Pick<DownloadRepository, "claimNextQueued">;
  processDownloadJobService: Pick<ProcessDownloadJobService, "execute">;
  idlePollIntervalMs?: number;
}

function createDownloadWorker({
  downloadRepository,
  processDownloadJobService,
  idlePollIntervalMs = 1000,
}: CreateDownloadWorkerInput) {
  async function waitForWork(signal: AbortSignal): Promise<boolean> {
    try {
      await delay(idlePollIntervalMs, undefined, { signal });
      return true;
    } catch {
      return false;
    }
  }

  async function processNext(): Promise<boolean> {
    const download = await downloadRepository.claimNextQueued();
    if (!download) {
      return false;
    }

    await processDownloadJobService.execute(download);
    return true;
  }

  async function run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const processed = await processNext();
        if (!processed && !(await waitForWork(signal))) {
          return;
        }
      } catch {
        if (!(await waitForWork(signal))) {
          return;
        }
      }
    }
  }

  return { processNext, run };
}

interface CreateDownloadCleanupWorkerInput {
  downloadRepository: Pick<DownloadRepository, "findExpiredForCleanup">;
  expireDownloadMediaService: Pick<ExpireDownloadMediaService, "execute">;
  idlePollIntervalMs?: number;
  clock?: () => Date;
}

function createDownloadCleanupWorker({
  downloadRepository,
  expireDownloadMediaService,
  idlePollIntervalMs = 60_000,
  clock = () => new Date(),
}: CreateDownloadCleanupWorkerInput) {
  async function processExpired(): Promise<number> {
    const expiredDownloads = await downloadRepository.findExpiredForCleanup(clock());
    for (const download of expiredDownloads) {
      await expireDownloadMediaService.execute(download);
    }
    return expiredDownloads.length;
  }

  async function waitForNextPoll(signal: AbortSignal): Promise<boolean> {
    try {
      await delay(idlePollIntervalMs, undefined, { signal });
      return true;
    } catch {
      return false;
    }
  }

  async function run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await processExpired();
      } catch {
        if (!(await waitForNextPoll(signal))) {
          return;
        }
        continue;
      }

      if (!(await waitForNextPoll(signal))) {
        return;
      }
    }
  }

  return { processExpired, run };
}

export { createDownloadCleanupWorker, createDownloadWorker };