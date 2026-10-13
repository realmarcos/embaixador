"use client";

import { useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDownToLine, History, LogOut, Settings } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ThemeToggle } from "@/components/theme-toggle";

function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, startLogout] = useTransition();

  function logout() {
    startLogout(async () => {
      try {
        await apiClient.logout();
      } finally {
        router.replace("/login");
      }
    });
  }

  return (
    <>
      <header className="app-header sticky top-0 z-20">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-8">
          <Link href="/" aria-label="Embaixador, início" aria-current={pathname === "/" ? "page" : undefined} className={`focus-ring flex shrink-0 items-center gap-2.5 rounded-md px-1 py-1 text-sm font-bold ${pathname === "/" ? "bg-white/10" : ""}`}>
            <span className="brand-mark grid size-8 place-items-center rounded-md"><ArrowDownToLine aria-hidden="true" size={17} /></span>
            <span className="hidden min-[380px]:inline">Embaixador</span>
          </Link>
          <nav aria-label="Navegação principal" className="flex items-center gap-0 sm:gap-2">
            <Link href="/history" aria-current={pathname === "/history" ? "page" : undefined} aria-label="Histórico" title="Histórico" data-active={pathname === "/history"} className="app-nav-link focus-ring inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium"><History aria-hidden="true" size={17} /><span className="hidden sm:inline">Histórico</span></Link>
            <Link href="/settings" aria-current={pathname === "/settings" ? "page" : undefined} aria-label="Configurações" title="Configurações" data-active={pathname === "/settings"} className="app-nav-link focus-ring inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium"><Settings aria-hidden="true" size={17} /><span className="hidden sm:inline">Configurações</span></Link>
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              aria-label="Sair da conta"
              title="Sair da conta"
              className="app-nav-link focus-ring grid size-9 place-items-center rounded-md disabled:opacity-50"
            >
              <LogOut aria-hidden="true" size={18} />
            </button>
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}

export default ProtectedLayout;