"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelOwnSubscriptionAction } from "@/features/subscriptions/actions";

export function CancelSubscriptionButton({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Cancelar sua assinatura?")) return;
    startTransition(async () => {
      try {
        await cancelOwnSubscriptionAction({ subscriptionId });
        toast.success("Assinatura cancelada.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao cancelar assinatura.");
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {isPending ? "Cancelando..." : "Cancelar assinatura"}
    </Button>
  );
}
