"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { updatePromotionAction, deletePromotionAction } from "../actions";

export function PromotionActions({ promotionId, active }: { promotionId: string; active: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        await updatePromotionAction({ promotionId, active: !active });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar promoção.");
      }
    });
  }

  function remove() {
    if (!confirm("Excluir esta promoção?")) return;
    startTransition(async () => {
      try {
        await deletePromotionAction({ promotionId });
        toast.success("Promoção excluída.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao excluir promoção.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={active} onCheckedChange={toggle} disabled={isPending} />
      <Button variant="ghost" size="icon" onClick={remove} disabled={isPending}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
