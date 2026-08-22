"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recalculateCommissionsAction } from "../actions";

export function RecalculateButton({ periodMonth }: { periodMonth: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await recalculateCommissionsAction({ periodMonth });
        toast.success(
          `Recalculado: ${result.appointmentsProcessed} atendimento(s), ${result.subscriptionAttendances} via assinatura.`,
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao recalcular.");
      }
    });
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={isPending}>
      <RefreshCw className={`mr-1 h-4 w-4 ${isPending ? "animate-spin" : ""}`} /> Recalcular
    </Button>
  );
}
