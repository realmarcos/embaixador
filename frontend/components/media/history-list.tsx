"use client";

import { ArrowDownToLine, RefreshCw, Trash2, VideoOff } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient, type DownloadRecord } from "@/lib/api-client";
import { formatFileSize } from "@/lib/formatting";

interface HistoryListProps {
  items: DownloadRecord[];
  pendingId: string | null;
  onDeleteMedia: (item: DownloadRecord) => void;
  onDeleteHistory: (item: DownloadRecord) => void;
  onRedownload: (item: DownloadRecord) => void;
}

const statusLabels: Record<DownloadRecord["status"], string> = {
  QUEUED: "Na fila",
  PROCESSING: "Preparando",
  READY: "Disponível",
  FAILED: "Falhou",
  MEDIA_DELETED: "Mídia removida",
  EXPIRED: "Expirado",
  DELETE_FAILED: "Remoção pendente",
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

function HistoryList({ items, pendingId, onDeleteMedia, onDeleteHistory, onRedownload }: HistoryListProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const initialTimeout = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(interval);
    };
  }, []);

  if (items.length === 0) {
    return <p className="border-t border-border py-8 text-center text-sm text-muted-foreground">Seu histórico está vazio.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const isPending = pendingId === item.id;
        const isExpired = now !== null && item.expiresAt !== null && new Date(item.expiresAt).getTime() <= now;
        const isReady = item.status === "READY" && Boolean(item.expiresAt) && !isExpired;
        const statusLabel = isExpired && item.status === "READY" ? "Prazo encerrado" : statusLabels[item.status];
        const fileSize = formatFileSize(item.sizeBytes);
        return (
          <li key={item.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{item.platform}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${isReady ? "bg-secondary text-primary" : item.status === "FAILED" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                  {statusLabel}
                </span>
              </div>
              <h2 className="mt-1 break-words text-sm font-semibold">{item.title ?? item.fileName ?? "Mídia sem título"}</h2>
              {item.selectedPresetId && <p className="mt-1 text-xs text-muted-foreground">Formato: {presetLabels[item.selectedPresetId] ?? "Formato selecionado"}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}
                {fileSize && ` · ${fileSize}`}
                {item.expiresAt && ` · até ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.expiresAt))}`}
              </p>
              {item.failureCode && <p className="mt-1 text-xs text-destructive">Código: {item.failureCode}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {isReady && (
                <a
                  href={apiClient.getDownloadFileUrl(item.id)}
                  aria-label="Baixar arquivo"
                  title="Baixar arquivo"
                  className="focus-ring grid size-9 place-items-center rounded-md text-primary transition hover:bg-secondary"
                >
                  <ArrowDownToLine aria-hidden="true" size={18} />
                </a>
              )}
              <button
                type="button"
                onClick={() => onRedownload(item)}
                disabled={isPending}
                aria-label="Tentar baixar novamente"
                title="Tentar baixar novamente"
                className="focus-ring grid size-9 place-items-center rounded-md text-muted-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <RefreshCw aria-hidden="true" size={17} />
              </button>
              {isReady && (
                <button
                  type="button"
                  onClick={() => onDeleteMedia(item)}
                  disabled={isPending}
                  aria-label="Remover somente a mídia"
                  title="Remover somente a mídia"
                  className="focus-ring grid size-9 place-items-center rounded-md text-muted-foreground transition hover:bg-muted disabled:opacity-40"
                >
                  <VideoOff aria-hidden="true" size={17} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDeleteHistory(item)}
                disabled={isPending}
                aria-label="Excluir item do histórico"
                title="Excluir item do histórico"
                className="focus-ring grid size-9 place-items-center rounded-md text-destructive transition hover:bg-destructive/10 disabled:opacity-40"
              >
                <Trash2 aria-hidden="true" size={17} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export { HistoryList };