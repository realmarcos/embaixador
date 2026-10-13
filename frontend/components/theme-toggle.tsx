"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Moon, Sun } from "lucide-react";
import { ApiClientError } from "@/lib/api-client";
import { nextTheme } from "@/lib/theme";
import { useTheme } from "@/components/theme-provider";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const targetTheme = nextTheme(theme);

  function toggleTheme() {
    setError(null);
    startTransition(async () => {
      try {
        await setTheme(targetTheme);
      } catch (cause) {
        setError(cause instanceof ApiClientError ? cause.message : "Não foi possível salvar o tema.");
      }
    });
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={toggleTheme}
        disabled={pending}
        aria-label={theme === "DARK" ? "Ativar tema claro" : "Ativar tema escuro"}
        title={theme === "DARK" ? "Ativar tema claro" : "Ativar tema escuro"}
        className="app-nav-link focus-ring grid size-9 place-items-center rounded-md disabled:opacity-50"
      >
        {pending ? <LoaderCircle aria-hidden="true" size={18} className="animate-spin" /> : theme === "DARK" ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
      </button>
      {error && <span role="status" className="absolute right-0 top-full z-10 mt-1 w-52 rounded-md border border-destructive/30 bg-popover p-2 text-xs text-destructive shadow-sm">{error}</span>}
    </span>
  );
}

export { ThemeToggle };