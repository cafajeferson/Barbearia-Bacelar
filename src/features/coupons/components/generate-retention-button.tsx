"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateRetentionCouponsAction } from "../actions";

export function GenerateRetentionButton() {
  const router = useRouter();
  const [days, setDays] = useState("30");
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const result = await generateRetentionCouponsAction({ daysInactive: Number(days) });
        toast.success(`${result.length} cupom(ns) de retorno gerado(s).`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao gerar cupons.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={days}
        onChange={(e) => setDays(e.target.value)}
        className="w-20"
        title="Dias de inatividade"
      />
      <Button variant="outline" onClick={run} disabled={isPending}>
        <Sparkles className="mr-1 h-4 w-4" /> Gerar cupons de retorno
      </Button>
    </div>
  );
}
