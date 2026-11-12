"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Repeat } from "lucide-react";
import { switchRoleModeAction } from "@/server/auth/actions";
import { cn } from "@/lib/utils";

/**
 * Troca entre a visão de admin e a de colaborador (Minha Agenda), para o
 * admin que também atende como barbeiro. Só aparece para quem pode trocar.
 */
export function RoleSwitchButton({ to, className }: { to: "admin" | "colaborador"; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await switchRoleModeAction(to);
          } catch (err) {
            // redirect() do Next sobe como erro "NEXT_REDIRECT": é o caminho normal.
            if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
            toast.error(err instanceof Error ? err.message : "Não foi possível trocar.");
          }
        })
      }
      className={cn(
        "flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-60",
        className,
      )}
    >
      <Repeat className="h-4 w-4" />
      {pending ? "Trocando..." : to === "colaborador" ? "Trocar para colaborador" : "Voltar para admin"}
    </button>
  );
}
