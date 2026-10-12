"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const RELOADED_FOR_KEY = "bacelar:reloaded-for-build";

/**
 * Recarrega a página sozinha quando o servidor já está numa versão mais
 * nova do que o JS aberto no navegador.
 *
 * Por quê: o app é uma SPA instalada na tela inicial (PWA) — a aba fica
 * aberta por dias, a navegação entre telas não baixa o JS de novo, e depois
 * de um deploy a pessoa continuava vendo a versão antiga (e as ações dela
 * falhavam com "Failed to find Server Action", visto no log de produção)
 * até fechar o app por completo ou limpar os dados do site.
 *
 * Confere ao voltar pro app (aba visível/foco) e a cada troca de tela —
 * momentos em que recarregar não interrompe nada que a pessoa esteja
 * digitando. O sessionStorage evita laço de recarga se, por qualquer
 * motivo, a versão nova não chegar ao navegador.
 */
export function VersionWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    if (CURRENT_BUILD === "dev") return;
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId?: string };
        if (cancelled || !buildId || buildId === CURRENT_BUILD) return;
        if (sessionStorage.getItem(RELOADED_FOR_KEY) === buildId) return;
        sessionStorage.setItem(RELOADED_FOR_KEY, buildId);
        window.location.reload();
      } catch {
        // Sem rede: tenta de novo na próxima oportunidade.
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") check();
    }

    check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [pathname]);

  return null;
}
