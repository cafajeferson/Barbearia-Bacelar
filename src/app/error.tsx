"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Rede de segurança pra qualquer erro que escape sem tratamento próprio —
 * antes disso o app não tinha NENHUM error.tsx, então um erro não pego
 * (ex.: cupom expirado que escapou do try/catch do wizard) derrubava a
 * tela inteira com a mensagem técnica padrão do Next.js.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erro não tratado:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Ops, algo deu errado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tente de novo — se continuar acontecendo, avise a equipe.
        </p>
      </div>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
