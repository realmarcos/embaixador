"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { ApiClientError, apiClient, type UserSettings } from "@/lib/api-client";
import { RetentionSetting } from "@/components/media/retention-setting";

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiClient.getSettings()
      .then((currentSettings) => {
        if (active) setSettings(currentSettings);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiClientError && cause.status === 401) {
          router.replace("/login");
          return;
        }
        setError(cause instanceof ApiClientError ? cause.message : "Não foi possível carregar as configurações.");
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="app-main-surface min-h-[calc(100dvh-4.25rem)] text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-7 sm:px-8 sm:py-10">
        <p className="flex items-center gap-2 text-sm font-medium text-primary"><SlidersHorizontal aria-hidden="true" size={16} /> Preferências da conta</p>
        <h1 className="mt-1 text-3xl font-semibold">Configurações</h1>

        <section className="app-panel mt-6 p-4 sm:p-6">
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {!settings && !error && <p role="status" className="py-4 text-sm text-muted-foreground">Carregando configurações...</p>}
          {settings && <RetentionSetting initialValue={settings.retentionHours} />}
        </section>
      </div>
    </main>
  );
}