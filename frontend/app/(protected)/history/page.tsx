"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ApiClientError, apiClient, type DownloadRecord } from "@/lib/api-client";
import { HistoryList } from "@/components/media/history-list";

function messageFrom(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Não foi possível carregar o histórico.";
}

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<DownloadRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [actionPending, startAction] = useTransition();

  const loadPage = useCallback((cursor?: string, append = false) => {
    startLoading(async () => {
      try {
        const page = await apiClient.getHistory({ cursor, limit: 20 });
        setItems((current) => append ? [...current, ...page.items] : page.items);
        setNextCursor(page.nextCursor);
        setError(null);
      } catch (cause) {
        if (cause instanceof ApiClientError && cause.status === 401) {
          router.replace("/login");
          return;
        }
        setError(messageFrom(cause));
      }
    });
  }, [router]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  function runItemAction(item: DownloadRecord, action: "media" | "history" | "redownload") {
    if (action === "history" && !window.confirm("Excluir este item e a mídia armazenada?")) return;
    if (action === "media" && !window.confirm("Remover o arquivo e manter o registro no histórico?")) return;
    setPendingId(item.id);
    setError(null);
    setNotice(null);
    startAction(async () => {
      try {
        if (action === "media") {
          await apiClient.deleteHistoryMedia(item.id);
          setItems((current) => current.map((entry) => entry.id === item.id
            ? { ...entry, status: "MEDIA_DELETED", fileName: null, mimeType: null, sizeBytes: null, expiresAt: null }
            : entry));
          setNotice("Mídia removida. O registro foi mantido no histórico.");
        } else if (action === "history") {
          await apiClient.deleteHistoryItem(item.id);
          setItems((current) => current.filter((entry) => entry.id !== item.id));
          setNotice("Item removido do histórico.");
        } else {
          const created = await apiClient.redownloadHistoryItem(item.id);
          setNotice(`Novo download adicionado à fila: ${created.id}`);
        }
      } catch (cause) {
        setError(messageFrom(cause));
      } finally {
        setPendingId(null);
      }
    });
  }

  function deleteAll() {
    if (!window.confirm("Excluir todo o histórico e as mídias armazenadas desta conta?")) return;
    startAction(async () => {
      try {
        await apiClient.deleteAllHistory();
        setItems([]);
        setNextCursor(null);
        setNotice("Histórico removido.");
      } catch (cause) {
        setError(messageFrom(cause));
      }
    });
  }

  return (
    <main className="app-main-surface min-h-[calc(100dvh-4.25rem)] text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-7 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Arquivos e atividades</p>
            <h1 className="mt-1 text-3xl font-semibold">Histórico</h1>
          </div>
          {items.length > 0 && <button type="button" onClick={deleteAll} disabled={actionPending} className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"><Trash2 aria-hidden="true" size={16} /> Limpar histórico</button>}
        </div>

        <section className="app-panel mt-6 px-4 sm:px-6" aria-label="Lista do histórico">
          {error && <p role="alert" className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="mt-5 rounded-md border border-primary/25 bg-secondary px-3 py-2 text-sm text-primary">{notice}</p>}
          {loading && items.length === 0 ? <p role="status" className="py-9 text-center text-sm text-muted-foreground">Carregando histórico...</p> : (
            <HistoryList
              items={items}
              pendingId={pendingId}
              onDeleteMedia={(item) => runItemAction(item, "media")}
              onDeleteHistory={(item) => runItemAction(item, "history")}
              onRedownload={(item) => runItemAction(item, "redownload")}
            />
          )}
          {nextCursor && <div className="border-t border-border py-4 text-center"><button type="button" onClick={() => loadPage(nextCursor, true)} disabled={loading} className="focus-ring h-9 rounded-md px-4 text-sm font-semibold text-primary hover:bg-secondary disabled:opacity-50">{loading ? "Carregando..." : "Carregar mais"}</button></div>}
        </section>
      </div>
    </main>
  );
}
