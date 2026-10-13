import { useEffect, useState } from "react";
import { ArrowDownToLine, Clock3, LoaderCircle } from "lucide-react";
import type { DownloadRecord } from "@/lib/api-client";

interface DownloadStatusProps {
  download: DownloadRecord;
  fileUrl: string;
}

const statusLabels: Record<DownloadRecord["status"], string> = {
  QUEUED: "Na fila",
  PROCESSING: "Preparando arquivo",
  READY: "Pronto para baixar",
  FAILED: "Não foi possível concluir",
  MEDIA_DELETED: "Arquivo removido",
  EXPIRED: "Prazo encerrado",
  DELETE_FAILED: "Falha ao remover arquivo",
};

const presetLabels: Record<string, string> = {
  original: "Original",
  "audio-mp3": "Áudio MP3",
  "audio-mp4": "Áudio MP4",
  "video-240p": "Vídeo 240p",
  "video-360p": "Vídeo 360p",
  "video-480p": "Vídeo 480p",
  "video-720p": "Vídeo 720p",
  "video-1080p": "Vídeo 1080p",
  "video-1440p": "Vídeo 1440p",
  "video-2k-dci": "Vídeo 2K (DCI)",
  "video-4k": "Vídeo 4K",
};

function DownloadStatus({ download, fileUrl }: DownloadStatusProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const initialTimeout = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(interval);
    };
  }, []);

  const active = download.status === "QUEUED" || download.status === "PROCESSING";
  const expiresAt = download.expiresAt ? new Date(download.expiresAt) : null;
  const available = download.status === "READY" && expiresAt !== null && now !== null && expiresAt.getTime() > now;

  return (
    <section aria-live="polite" aria-labelledby="download-status-heading" className="border-t border-border pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-md ${available ? "bg-accent text-accent-foreground" : active ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"}`}>
            {active ? <LoaderCircle aria-hidden="true" size={19} className="animate-spin" /> : available ? <ArrowDownToLine aria-hidden="true" size={19} /> : <Clock3 aria-hidden="true" size={19} />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Download</p>
            <h2 id="download-status-heading" className="mt-1 break-words text-base font-semibold">{download.title ?? "Mídia selecionada"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{statusLabels[download.status]}</p>
            {download.selectedPresetId && <p className="mt-1 text-xs text-muted-foreground">Formato: {presetLabels[download.selectedPresetId] ?? "Formato selecionado"}</p>}
            {available && expiresAt && <p className="mt-2 text-xs text-muted-foreground">Disponível até {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(expiresAt)}</p>}
            {download.status === "FAILED" && download.failureCode && <p className="mt-2 text-xs text-destructive">Código: {download.failureCode}</p>}
          </div>
        </div>

        {available && (
          <a
            href={fileUrl}
            className="focus-ring inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <ArrowDownToLine aria-hidden="true" size={17} />
            Baixar arquivo
          </a>
        )}
      </div>
    </section>
  );
}

export { DownloadStatus };