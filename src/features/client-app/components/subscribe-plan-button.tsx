"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestClientSubscriptionAction } from "@/features/subscriptions/actions";

export function SubscribePlanButton({ clientId, planId }: { clientId: string; planId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await requestClientSubscriptionAction({ clientId, planId });
        toast.success("Solicitação enviada! Aguarde a aprovação.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao assinar plano.");
      }
    });
  }

  return (
    <Button className="w-full" onClick={handleClick} disabled={isPending}>
      <Send className="mr-1.5 h-4 w-4" />
      {isPending ? "Enviando..." : "Quero este plano"}
    </Button>
  );
}
