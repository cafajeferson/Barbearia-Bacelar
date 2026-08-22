"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateCouponAction, deleteCouponAction } from "../actions";

const STATUS_OPTIONS = ["PENDING", "ACTIVE", "USED", "EXPIRED", "DISABLED"] as const;

export function CouponActions({ couponId, status }: { couponId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function changeStatus(next: string) {
    startTransition(async () => {
      try {
        await updateCouponAction({ couponId, status: next as (typeof STATUS_OPTIONS)[number] });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar cupom.");
      }
    });
  }

  function remove() {
    if (!confirm("Excluir este cupom?")) return;
    startTransition(async () => {
      try {
        await deleteCouponAction({ couponId });
        toast.success("Cupom excluído.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao excluir cupom.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Select value={status} onValueChange={changeStatus} disabled={isPending}>
        <SelectTrigger className="h-8 w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" onClick={remove} disabled={isPending}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export function CopyCodeButton({ code }: { code: string }) {
  return (
    <button
      className="flex items-center gap-1 font-mono text-xs hover:text-primary"
      onClick={() => {
        navigator.clipboard.writeText(code);
        toast.success("Código copiado.");
      }}
    >
      {code} <Copy className="h-3 w-3" />
    </button>
  );
}
