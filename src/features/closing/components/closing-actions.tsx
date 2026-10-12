"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markMonthCommissionsPaidAction } from "../actions";
import type { ClosingRow } from "../service";

function usePay(periodMonth: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function pay(professionalId?: string) {
    startTransition(async () => {
      try {
        const { updated } = await markMonthCommissionsPaidAction({ periodMonth, professionalId });
        toast.success(updated > 0 ? `${updated} lançamento(s) marcados como pagos.` : "Não havia nada pendente.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao marcar como pago.");
      }
    });
  }
  return { isPending, pay };
}

/** Valor em formato de planilha brasileira (vírgula decimal, sem "R$"). */
function csvNumber(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function ClosingExportButtons({
  rows,
  monthLabel,
  fileSlug,
}: {
  rows: ClosingRow[];
  monthLabel: string;
  fileSlug: string;
}) {
  function downloadCsv() {
    const header = ["Barbeiro", "Atendimentos", "Serviços", "Produtos", "Comissão", "Assinatura", "Já pago", "A pagar"];
    const lines = rows.map((r) =>
      [
        `"${r.name.replace(/"/g, '""')}"`,
        r.attendances,
        csvNumber(r.services),
        csvNumber(r.products),
        csvNumber(r.commission),
        csvNumber(r.subscription),
        csvNumber(r.paid),
        csvNumber(r.pending),
      ].join(";"),
    );
    // BOM + ponto-e-vírgula: abre certo no Excel em português, com acentos.
    const csv = "﻿" + [`"Fechamento de ${monthLabel}"`, header.join(";"), ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fechamento-${fileSlug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button variant="outline" onClick={downloadCsv}>
        <Download className="mr-1 h-4 w-4" /> CSV
      </Button>
      {/* "PDF" = a caixa de impressão do navegador, que salva como PDF — o
          menu e os botões somem na impressão (classes print:hidden). */}
      <Button variant="outline" onClick={() => window.print()}>
        <FileText className="mr-1 h-4 w-4" /> PDF
      </Button>
    </>
  );
}

export function PayAllButton({ periodMonth, disabled }: { periodMonth: string; disabled: boolean }) {
  const { isPending, pay } = usePay(periodMonth);
  return (
    <Button
      onClick={() => {
        if (confirm("Marcar TODAS as comissões pendentes deste mês como pagas?")) pay();
      }}
      disabled={disabled || isPending}
      className="print:hidden"
    >
      <CheckCheck className="mr-1 h-4 w-4" /> Marcar tudo como pago
    </Button>
  );
}

export function PayProfessionalButton({
  periodMonth,
  professionalId,
}: {
  periodMonth: string;
  professionalId: string;
}) {
  const { isPending, pay } = usePay(periodMonth);
  return (
    <Button size="sm" variant="outline" onClick={() => pay(professionalId)} disabled={isPending}>
      Marcar como pago
    </Button>
  );
}
