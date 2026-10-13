"use client";

import type { MediaPreset } from "@/lib/api-client";
import { ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaOptionsProps {
  options: MediaPreset[];
  selectedId: string;
  pending: boolean;
  onSelect: (id: string) => void;
  onDownload: () => void;
}

function MediaOptions({ options, selectedId, pending, onSelect, onDownload }: MediaOptionsProps) {
  return (
    <section aria-labelledby="options-heading" className="border-t border-border pt-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Formatos encontrados</p>
          <h2 id="options-heading" className="mt-1 text-lg font-semibold">Escolha uma opção</h2>
        </div>
        <span className="text-xs text-muted-foreground">{options.length} disponíveis</span>
      </div>

      <fieldset className="grid gap-2 border-0 p-0 sm:grid-cols-2" aria-labelledby="options-heading">
        {options.map((option) => {
          const selected = option.id === selectedId;
          const kind = option.kind === "original" ? "Original" : option.kind === "audio" ? "Áudio" : "Vídeo";
          const details = option.width && option.height
            ? `${option.width} × ${option.height} · ${option.container.toUpperCase()}`
            : `${kind} · ${option.container.toUpperCase()}`;
          return (
            <label
              key={option.id}
              className={`flex min-h-[68px] cursor-pointer items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${selected ? "border-primary bg-secondary" : "border-border bg-card hover:border-primary/40"}`}
            >
              <input
                type="radio"
                name="media-option"
                value={option.id}
                checked={selected}
                onChange={() => onSelect(option.id)}
                className="size-4 shrink-0 accent-[var(--brand-purple)]"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{details}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <Button
        type="button"
        onClick={onDownload}
        disabled={!selectedId || pending}
        className="mt-4 h-11 w-full gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 disabled:cursor-wait"
      >
        {!pending && <ArrowDownToLine aria-hidden="true" size={17} />}
        {pending ? "Adicionando à fila..." : "Baixar mídia"}
      </Button>
    </section>
  );
}

export { MediaOptions };