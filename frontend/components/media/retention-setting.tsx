"use client";

import { useState, useTransition } from "react";
import { Check, Clock3, LoaderCircle } from "lucide-react";
import { ApiClientError, apiClient, type UserSettings } from "@/lib/api-client";
import { formatRetentionHours } from "@/lib/formatting";

const retentionValues: UserSettings["retentionHours"][] = [
  1, 8, 24, 72, 168, 336, 720,
];
const retentionChoices = retentionValues.map((value) => ({ value, label: formatRetentionHours(value) }));

interface RetentionSettingProps {
  initialValue: UserSettings["retentionHours"];
}

function RetentionSetting({ initialValue }: RetentionSettingProps) {
  const [value, setValue] = useState<UserSettings["retentionHours"]>(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const updated = await apiClient.updateSettings({ retentionHours: value });
        setValue(updated.retentionHours);
        setSavedValue(updated.retentionHours);
        setMessage("Preferência salva.");
      } catch (error) {
        setMessage(error instanceof ApiClientError ? error.message : "Não foi possível salvar a preferência.");
      }
    });
  }

  return (
    <section aria-labelledby="retention-title" className="border-t border-border pt-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-primary"><Clock3 aria-hidden="true" size={19} /></span>
        <div className="min-w-0">
          <h2 id="retention-title" className="text-base font-semibold">Prazo de retenção</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Define por quanto tempo um novo arquivo fica disponível para download.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor="retention-hours" className="text-sm font-medium">Manter arquivos por</label>
          <select
            id="retention-hours"
            value={value}
            onChange={(event) => setValue(Number(event.target.value) as UserSettings["retentionHours"])}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            {retentionChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending || value === savedValue}
          className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <LoaderCircle aria-hidden="true" size={17} className="animate-spin" /> : <Check aria-hidden="true" size={17} />}
          Salvar
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">A alteração vale apenas para downloads que ficarem prontos depois de salvar. Arquivos existentes mantêm o prazo original.</p>
      {message && <p role="status" aria-live="polite" className={`mt-3 text-sm ${message.includes("Não foi") ? "text-destructive" : "text-primary"}`}>{message}</p>}
    </section>
  );
}

export { RetentionSetting };