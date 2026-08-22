"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  runRecurringGeneratorAction,
  runNoShowSweepAction,
  runReminderSchedulerAction,
  runRetentionCouponGeneratorAction,
  runCommissionApuracaoAction,
} from "../actions";

const JOBS = [
  {
    key: "recurring",
    title: "Gerador de recorrência",
    description: "Materializa os próximos agendamentos de cada série recorrente ativa.",
    run: runRecurringGeneratorAction,
    cadenceHint: "Diário (via scripts/run-jobs.ts na Fase 10)",
  },
  {
    key: "noshow",
    title: "Varredura de no-show",
    description: "Marca como não compareceu agendamentos vencidos há mais de 2h sem confirmação/conclusão.",
    run: runNoShowSweepAction,
    cadenceHint: "A cada hora",
  },
  {
    key: "reminders",
    title: "Lembretes de agendamento",
    description: "Envia (ou enfileira, se o WhatsApp ainda não estiver conectado) lembretes 24h antes.",
    run: runReminderSchedulerAction,
    cadenceHint: "A cada hora",
  },
  {
    key: "retention",
    title: "Cupons de retorno",
    description: "Gera cupons RETORNO-* para clientes inativos há 30+ dias.",
    run: runRetentionCouponGeneratorAction,
    cadenceHint: "Diário",
  },
  {
    key: "commission",
    title: "Apuração de comissões",
    description: "Recalcula as comissões do mês anterior.",
    run: runCommissionApuracaoAction,
    cadenceHint: "1º dia do mês",
  },
] as const;

export function JobTriggerPanel() {
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<Record<string, string>>({});
  const [runningKey, setRunningKey] = useState<string | null>(null);

  function run(job: (typeof JOBS)[number]) {
    setRunningKey(job.key);
    startTransition(async () => {
      try {
        const result = await job.run();
        setResults((prev) => ({ ...prev, [job.key]: JSON.stringify(result) }));
        toast.success(`${job.title} executado.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao rodar automação.");
      } finally {
        setRunningKey(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {JOBS.map((job) => (
        <Card
          key={job.key}
          data-testid={`job-${job.key}`}
          className="flex items-center justify-between gap-4 p-4"
        >
          <div className="min-w-0">
            <p className="font-medium">{job.title}</p>
            <p className="text-xs text-muted-foreground">{job.description}</p>
            <p className="text-xs text-muted-foreground">Cadência: {job.cadenceHint}</p>
            {results[job.key] && (
              <p className="mt-1 truncate text-xs text-primary">{results[job.key]}</p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending && runningKey === job.key}
            onClick={() => run(job)}
          >
            <Play className="mr-1 h-3 w-3" />
            {isPending && runningKey === job.key ? "Rodando..." : "Rodar agora"}
          </Button>
        </Card>
      ))}
    </div>
  );
}
