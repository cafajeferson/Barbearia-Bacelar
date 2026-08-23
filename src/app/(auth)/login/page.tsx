"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/shared/lib/supabase-browser";
import { loginAction } from "./actions";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth: "Não foi possível concluir o login com Google. Tente de novo.",
  "sem-email": "Sua conta Google precisa ter um e-mail associado.",
  conflito: "Este e-mail já está vinculado a outra conta. Fale com a administração.",
  inativo: "Sua conta está desativada. Fale com a administração.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A11.99 11.99 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(OAUTH_ERROR_MESSAGES[oauthError] ?? "Não foi possível fazer login.");
    }
  }, [searchParams]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await loginAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  async function handleGoogleLogin() {
    setError(null);
    setIsGoogleLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      setError("Não foi possível iniciar o login com Google.");
      setIsGoogleLoading(false);
    }
    // Em caso de sucesso, o navegador já é redirecionado pro Google — não
    // há mais nada a fazer aqui.
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6"
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {/* Mobile: tela cheia, sem caixa/borda, elementos maiores pro toque —
          o card pequeno flutuando no meio de uma tela preta enorme ficava
          minúsculo demais num celular de verdade. Em telas maiores (sm+),
          volta a ser um card centralizado, que funciona bem em desktop. */}
      <div className="w-full max-w-sm space-y-6 rounded-none border-0 bg-transparent p-0 sm:space-y-4 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-8">
        <div className="flex flex-col items-center gap-4 pb-2 sm:gap-3">
          <Image
            src="/brand/icon-any.png"
            alt="Barbearia Bacelar"
            width={160}
            height={160}
            priority
            className="h-36 w-36 rounded-full sm:h-32 sm:w-32"
          />
          <h1 className="text-2xl font-semibold text-primary sm:text-xl">Barbearia Bacelar</h1>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-base font-medium hover:bg-accent disabled:opacity-50 sm:h-10 sm:text-sm"
        >
          <GoogleIcon />
          {isGoogleLoading ? "Redirecionando..." : "Continuar com Google"}
        </button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          ou
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              className="h-14 w-full rounded-md border border-input bg-background px-4 text-base sm:h-10 sm:px-3 sm:text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-14 w-full rounded-md border border-input bg-background px-4 text-base sm:h-10 sm:px-3 sm:text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-14 w-full text-base sm:h-10 sm:text-sm" disabled={isPending}>
            {isPending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </main>
  );
}
