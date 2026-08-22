"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteServiceAction } from "../actions";

export function ServiceDeleteButton({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove() {
    if (!confirm("Excluir este serviço?")) return;
    startTransition(async () => {
      try {
        await deleteServiceAction({ serviceId });
        toast.success("Serviço excluído.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao excluir serviço.");
      }
    });
  }

  return (
    <Button variant="ghost" size="icon" onClick={remove} disabled={isPending}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
