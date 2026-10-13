"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { ApiClientError, apiClient, type Account, type DownloadRecord, type MediaAnalysis } from "@/lib/api-client";
import { DownloadStatus } from "@/components/media/download-status";
import { MediaOptions } from "@/components/media/media-options";
import { MediaUrlForm } from "@/components/media/media-url-form";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";

function safeMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : "Não foi possível concluir a solicitação. Tente novamente.";
}

function isFinished(status: DownloadRecord["status"]): boolean {
  return status !== "QUEUED" && status !== "PROCESSING";
}

export default function ProtectedDashboardPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [analysis, setAnalysis] = useState<MediaAnalysis | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [download, setDownload] = useState<DownloadRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [analyzing, startAnalyze] = useTransition();
  const [queueing, startQueue] = useTransition();

  useEffect(() => {
    let active = true;
    void apiClient.getCurrentAccount()
      .then((currentAccount) => {
        if (active) setAccount(currentAccount);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiClientError && cause.status === 401) {
          router.replace("/login");
          return;
        }
        setError(safeMessage(cause));
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!download || isFinished(download.status)) return;
    let active = true;
    let requestInFlight = false;
    const timer = window.setInterval(() => {
      if (requestInFlight) return;
      requestInFlight = true;
      void apiClient.getDownload(download.id)
        .then((updated) => {
          if (active) {
            setDownload(updated);
            setStatusError(null);
          }
        })
        .catch((cause: unknown) => {
          if (active) setStatusError(safeMessage(cause));
        })
        .finally(() => {
          requestInFlight = false;
        });
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [download]);

  function analyze(url: string) {
    setError(null);
    setStatusError(null);
    setDownload(null);
    startAnalyze(async () => {
      try {
        const result = await apiClient.analyzeMedia(url);
        setAnalysis(result);
        setSourceUrl(url);
        setSelectedId(result.options[0]?.id ?? "");
      } catch (cause) {
        setAnalysis(null);
        setError(safeMessage(cause));
      }
    });
  }

  function queueDownload() {
    if (!analysis || !selectedId) return;
    setError(null);
    startQueue(async () => {
      try {
        const created = await apiClient.createDownload({ url: sourceUrl, presetId: selectedId });
        setDownload(created);
      } catch (cause) {
        setError(safeMessage(cause));
      }
    });
  }

  if (checkingSession || !account) {
    return (
      <main className="app-main-surface grid min-h-screen place-items-center px-6 text-foreground">
        <p role="status" className="text-sm text-muted-foreground">{checkingSession ? "Verificando sessão..." : error ?? "Redirecionando..."}</p>
      </main>
    );
  }

  return (
    <main className="app-main-surface min-h-[calc(100dvh-4.25rem)] text-foreground">
      <div className="mx-auto grid max-w-6xl gap-7 px-4 py-7 sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-10 lg:py-11">
        <section className="min-w-0">
          <div className="mb-6">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Sparkles aria-hidden="true" size={15} /><AnimatedShinyText className="mx-0 text-primary">Olá, {account.name.split(" ")[0]}</AnimatedShinyText></p>
            <h1 className="text-3xl font-semibold">Novo download</h1>
            <p className="mt-1 text-sm text-muted-foreground">Cole um link público para escolher o formato e baixar sua mídia.</p>
          </div>

          <div className="app-panel space-y-6 p-4 sm:p-6">
            <MediaUrlForm pending={analyzing} onAnalyze={analyze} />

            {error && <p role="alert" aria-live="assertive" className="rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">{error}</p>}

            {analysis && (
              <>
                <div className="border-t border-border pt-5">
                  <p className="text-xs font-semibold uppercase text-primary">{analysis.platform}</p>
                  <h2 className="mt-1 break-words text-base font-semibold">{analysis.title ?? "Publicação sem título"}</h2>
                </div>
                {analysis.options.length > 0 ? (
                  <MediaOptions
                    options={analysis.options}
                    selectedId={selectedId}
                    pending={queueing}
                    onSelect={setSelectedId}
                    onDownload={queueDownload}
                  />
                ) : (
                  <p role="status" className="border-t border-border pt-5 text-sm text-muted-foreground">Nenhuma opção de mídia está disponível para este link.</p>
                )}
              </>
            )}

            {download && <DownloadStatus download={download} fileUrl={apiClient.getDownloadFileUrl(download.id)} />}
            {statusError && <p role="alert" className="text-sm text-destructive">{statusError}</p>}
          </div>
        </section>

        <aside className="app-panel h-fit p-5 lg:mt-[7.25rem]">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck aria-hidden="true" size={18} className="text-primary" /> Conta protegida</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Sua sessão usa cookie seguro. Os arquivos são privados e ficam disponíveis pelo prazo configurado na conta.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
            <span className="rounded border border-border bg-muted px-2 py-1">YouTube</span>
            <span className="rounded border border-border bg-muted px-2 py-1">Instagram</span>
            <span className="rounded border border-border bg-muted px-2 py-1">Facebook</span>
          </div>
        </aside>
      </div>
    </main>
  );
}