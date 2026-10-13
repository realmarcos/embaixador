"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { ShimmerButton } from "@/components/ui/shimmer-button";

type AuthMode = "login" | "register";

function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") ?? "");
    const password = String(values.get("password") ?? "");
    const name = String(values.get("name") ?? "");

    startTransition(async () => {
      try {
        if (isRegister) {
          await apiClient.register({ name, email, password });
          await apiClient.login({ email, password });
        } else {
          await apiClient.login({ email, password });
        }
        router.replace("/");
      } catch (cause) {
        setError(cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível concluir o acesso. Tente novamente.");
      }
    });
  }

  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(300px,0.9fr)_1.1fr]">
      <aside className="auth-brand-panel relative flex min-h-[230px] flex-col justify-between overflow-hidden px-6 py-6 sm:min-h-[250px] sm:px-10 sm:py-8 lg:min-h-screen lg:px-12 lg:py-11">
        <Link href="/" className="relative flex w-fit items-center gap-3 text-sm font-semibold tracking-[0.12em]">
          <span className="brand-mark grid size-10 place-items-center rounded-md">
            <ArrowDownToLine aria-hidden="true" size={21} />
          </span>
          Embaixador
        </Link>

        <div className="relative max-w-lg py-9 lg:py-0">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase text-white/75">
            <span className="size-2 rounded-full bg-accent" />
            YouTube · Instagram · Facebook
          </p>
          <h1 className="max-w-md text-4xl font-semibold leading-[1.08] sm:text-5xl">
            {isRegister ? "Guarde o que vale a pena." : "Suas mídias, no seu tempo."}
          </h1>
          <p className="mt-5 max-w-sm text-base leading-7 text-white/80">
            {isRegister
              ? "Crie sua conta para organizar downloads privados em um só lugar."
              : "Entre para continuar de onde parou, com seus arquivos e histórico protegidos."}
          </p>
        </div>

        <p className="relative hidden text-xs text-white/75 lg:block">Arquivos privados. Prazo de retenção sob seu controle.</p>
      </aside>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-14">
        <div className="w-full max-w-[430px]">
          <div className="mb-9">
            <p className="text-sm font-medium text-primary">{isRegister ? "Comece por aqui" : "Bem-vindo de volta"}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-foreground">
              {isRegister ? "Criar conta" : "Entrar na conta"}
            </h2>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {isRegister && (
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">Nome</label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={1}
                  maxLength={120}
                  className="h-11 text-base"
                />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">E-mail</label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                className="h-11 text-base"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Senha</label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 12 : 1}
                maxLength={128}
                aria-describedby={isRegister ? "password-hint" : undefined}
                className="h-11 text-base"
              />
              {isRegister && <p id="password-hint" className="text-xs text-muted-foreground">Use de 12 a 128 caracteres.</p>}
            </div>

            {error && <p role="alert" aria-live="assertive" className="rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">{error}</p>}

            <ShimmerButton
              type="submit"
              disabled={pending}
              shimmerColor="#ffd000"
              background="#6125ff"
              borderRadius="0.5rem"
              className="h-11 w-full gap-2 border-white/20 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
            >
              {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <Check aria-hidden="true" size={17} />}
              {pending ? "Aguarde..." : isRegister ? "Criar conta" : "Entrar"}
              {!pending && <ArrowRight aria-hidden="true" size={17} />}
            </ShimmerButton>
          </form>

          <p className="mt-7 text-sm text-muted-foreground">
            {isRegister ? "Já tem uma conta?" : "Ainda não tem uma conta?"}{" "}
            <Link href={isRegister ? "/login" : "/register"} className="font-semibold text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary">
              {isRegister ? "Entrar" : "Criar conta"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export { AuthForm };