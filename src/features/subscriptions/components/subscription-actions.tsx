"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  approveClientSubscriptionAction,
  rejectClientSubscriptionAction,
  setClientSubscriptionStatusAction,
  addManualCreditUsageAction,
} from "../actions";

export function SubscriptionActions({
  subscriptionId,
  status,
}: {
  subscriptionId: string;
  status: string;
}) {
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

  if (status === "PENDING") {
    return (
      <div className="flex gap-1">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => run(() => approveClientSubscriptionAction({ subscriptionId }), "Assinatura aprovada.")}
        >
          <Check className="mr-1 h-4 w-4" /> Aprovar
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => rejectClientSubscriptionAction({ subscriptionId }), "Assinatura rejeitada.")}
        >
          <X className="mr-1 h-4 w-4" /> Rejeitar
        </Button>
      </div>
    );
  }

  if (status === "ACTIVE" || status === "PAUSED") {
    return (
      <div className="flex items-center gap-1">
        <Select
          value={status}
          onValueChange={(value) =>
            run(
              () =>
                setClientSubscriptionStatusAction({
                  subscriptionId,
                  status: value as "ACTIVE" | "PAUSED",
                }),
              "Status atualizado.",
            )
          }
        >
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Ativar</SelectItem>
            <SelectItem value="PAUSED">Pausar</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          disabled={isPending}
          title="Registrar uso manual de crédito"
          onClick={() => run(() => addManualCreditUsageAction({ subscriptionId }), "Crédito registrado.")}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return null;
}
