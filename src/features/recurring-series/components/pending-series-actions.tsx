"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveRecurringSeriesAction, rejectRecurringSeriesAction } from "../actions";

export function PendingSeriesActions({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>, successMsg: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(successMsg);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro na ação.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => run(() => rejectRecurringSeriesAction({ seriesId }), "Pedido recusado.")}
      >
        Recusar
      </Button>
      <Button
        size="sm"
        className="bg-success text-success-foreground hover:bg-success/90"
        disabled={isPending}
        onClick={() => run(() => approveRecurringSeriesAction({ seriesId }), "Pedido aceito.")}
      >
        <Check className="mr-1 h-4 w-4" /> Aceitar pedido
      </Button>
    </div>
  );
}
