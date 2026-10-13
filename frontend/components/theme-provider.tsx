"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ApiClientError, apiClient } from "@/lib/api-client";
import type { ThemePreference } from "@/lib/theme";

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemePreference): void {
  document.documentElement.classList.toggle("dark", theme === "DARK");
  document.documentElement.style.colorScheme = theme === "DARK" ? "dark" : "light";
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [theme, setThemeState] = useState<ThemePreference>("LIGHT");
  const initialized = useRef(false);

  useEffect(() => {
    if (!pathname || !["/", "/history", "/settings"].includes(pathname) || initialized.current) return;
    let active = true;
    void apiClient.getSettings()
      .then((settings) => {
        if (!active) return;
        initialized.current = true;
        setThemeState(settings.themePreference);
        applyTheme(settings.themePreference);
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof ApiClientError && error.status === 401)) return;
        initialized.current = true;
        applyTheme("LIGHT");
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  async function setTheme(nextTheme: ThemePreference): Promise<void> {
    const saved = await apiClient.updateSettings({ themePreference: nextTheme });
    setThemeState(saved.themePreference);
    applyTheme(saved.themePreference);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return value;
}

export { ThemeProvider, useTheme };