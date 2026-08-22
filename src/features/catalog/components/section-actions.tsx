"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { updateServiceSectionAction, deleteServiceSectionAction } from "../actions";

export function SectionActions({ sectionId, active }: { sectionId: string; active: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      try {
        await updateServiceSectionAction({ sectionId, active: !active });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar seção.");
      }
    });
  }

  function remove() {
    if (!confirm("Excluir esta seção e todos os serviços dentro dela?")) return;
    startTransition(async () => {
      try {
        await deleteServiceSectionAction({ sectionId });
        toast.success("Seção excluída.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao excluir seção.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={active} onCheckedChange={toggleActive} disabled={isPending} />
      <Button variant="ghost" size="icon" onClick={remove} disabled={isPending}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
