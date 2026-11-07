"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeOpenUntilPreviousMonthAction } from "../actions";

/** "Encerrar até <mês>": conclui como sistema tudo que ficou aberto até o fim do mês passado. */
export function CloseUntilButton({ monthLabel, count }: { monthLabel: string; count: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={isPending || count === 0}
      onClick={() => {
        if (
          !window.confirm(
            `Concluir os ${count} atendimento(s) em aberto até ${monthLabel}? Eles ficam com o selo "Fechado pelo sistema" e entram na comissão.`,
          )
        )
          return;
        startTransition(async () => {
          try {
            const { closed } = await closeOpenUntilPreviousMonthAction();
            toast.success(`${closed} atendimento(s) encerrado(s).`);
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Não foi possível encerrar.");
          }
        });
      }}
    >
      <CheckCheck className="mr-1 h-4 w-4" /> Encerrar até {monthLabel}
    </Button>
  );
}
