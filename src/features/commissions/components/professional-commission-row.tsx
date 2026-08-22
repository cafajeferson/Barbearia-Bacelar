"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/shared/lib/format";
import { markCommissionsPaidAction } from "../actions";

type Entry = {
  id: string;
  calculatedAmount: unknown;
  status: string;
  calculationFormula: string | null;
  createdAt: Date;
};

export function ProfessionalCommissionRow({
  professionalId,
  name,
  pending,
  paid,
  entries,
  periodMonth,
  type,
}: {
  professionalId: string;
  name: string;
  pending: number;
  paid: number;
  entries: Entry[];
  periodMonth: string;
  type: "SERVICE" | "SUBSCRIPTION";
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function markPaid() {
    startTransition(async () => {
      try {
        await markCommissionsPaidAction({ professionalId, periodMonth, type });
        toast.success("Comissões marcadas como pagas.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao marcar como pago.");
      }
    });
  }

  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="flex items-center gap-2 font-medium">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {name}
        </span>
        <span className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">Pendente: {formatBRL(pending)}</span>
          <span className="text-success">Pago: {formatBRL(paid)}</span>
          <span className="font-semibold">Total: {formatBRL(pending + paid)}</span>
          {pending > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                markPaid();
              }}
            >
              Marcar como pago
            </Button>
          )}
        </span>
      </button>
      {expanded && (
        <div className="space-y-1 bg-muted/30 px-4 py-2">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{e.calculationFormula}</span>
              <span className="flex items-center gap-2">
                {formatBRL(Number(e.calculatedAmount))}
                <span className={e.status === "PAID" ? "text-success" : ""}>{e.status}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
