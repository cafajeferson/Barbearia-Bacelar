"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getMonthAvailabilityAction,
  getUnionAvailableSlotsAction,
} from "@/features/appointments/actions";

const LEVEL_COLOR: Record<string, string> = {
  MUITOS: "bg-success",
  POUCOS: "bg-warning",
  NENHUM: "bg-muted",
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function groupByPeriod(times: string[]) {
  const groups: { label: string; times: string[] }[] = [
    { label: "Manhã", times: times.filter((t) => t < "12:00") },
    { label: "Tarde", times: times.filter((t) => t >= "12:00" && t < "18:00") },
    { label: "Noite", times: times.filter((t) => t >= "18:00") },
  ];
  return groups.filter((g) => g.times.length > 0);
}

export function Step3Schedule({
  professionalIds,
  durationMinutes,
  selectedDate,
  selectedTime,
  recurring,
  recurringIntervalDays,
  onSelectDate,
  onSelectTime,
  onRecurringChange,
  onIntervalChange,
  onContinue,
  onBack,
}: {
  professionalIds: string[];
  durationMinutes: number;
  selectedDate: Date | null;
  selectedTime: string | null;
  recurring: boolean;
  recurringIntervalDays: number;
  onSelectDate: (d: Date) => void;
  onSelectTime: (t: string) => void;
  onRecurringChange: (v: boolean) => void;
  onIntervalChange: (v: number) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  // Mês exibido no calendário — começa no mês da data já escolhida (se
  // houver) ou no mês atual.
  const [viewYear, setViewYear] = useState((selectedDate ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState((selectedDate ?? today).getMonth());

  const [levels, setLevels] = useState<Record<string, "MUITOS" | "POUCOS" | "NENHUM">>({});
  const [times, setTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);

  function goToMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  useEffect(() => {
    getMonthAvailabilityAction({ professionalIds, year: viewYear, month: viewMonth, durationMinutes }).then(
      setLevels,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionalIds.join(","), durationMinutes, viewYear, viewMonth]);

  useEffect(() => {
    if (!selectedDate) return;
    // Se o usuário troca de dia rápido (ou a rede está lenta), duas
    // requisições ficam em voo ao mesmo tempo e podem resolver fora de
    // ordem — sem essa guarda, a resposta de um dia ANTERIOR podia chegar
    // depois e sobrescrever `times` do dia atual com horários de outro dia
    // (inclusive um dia sem nenhuma vaga real).
    let cancelled = false;
    setLoadingTimes(true);
    getUnionAvailableSlotsAction({ professionalIds, date: isoDate(selectedDate), durationMinutes })
      .then((result) => {
        if (!cancelled) setTimes(result);
      })
      .finally(() => {
        if (!cancelled) setLoadingTimes(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate?.getTime(), professionalIds.join(","), durationMinutes]);

  const periods = groupByPeriod(times);

  // Grade do mês: dias 1..N do mês, com células vazias no começo pra
  // alinhar com o dia da semana certo (domingo = coluna 0).
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(viewYear, viewMonth, 1),
  );

  // Não deixa voltar antes do mês atual — não tem sentido escolher um dia no passado.
  const canGoPrev = new Date(viewYear, viewMonth, 1) > new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Escolha o horário</h1>

      <div className="rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            disabled={!canGoPrev}
            className="rounded-md border p-1.5 disabled:opacity-30"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium capitalize">{monthLabel}</span>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            className="rounded-md border p-1.5"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAY_LABELS.map((w) => (
            <span key={w} className="text-[10px] uppercase text-muted-foreground">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} />;
            const iso = isoDate(d);
            const isPast = d < today;
            const active = selectedDate && isoDate(selectedDate) === iso;
            const level = levels[iso];
            return (
              <button
                key={iso}
                type="button"
                disabled={isPast}
                onClick={() => onSelectDate(d)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md border border-transparent p-1.5 disabled:opacity-30",
                  active && "border-primary bg-primary/10",
                )}
              >
                <span className="text-sm font-medium">{d.getDate()}</span>
                <span className={cn("h-1.5 w-1.5 rounded-full", level ? LEVEL_COLOR[level] : "bg-muted")} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Agendamento recorrente</p>
          <p className="text-xs text-muted-foreground">Repete automaticamente e vira cliente fixo</p>
        </div>
        <Switch checked={recurring} onCheckedChange={onRecurringChange} />
      </div>
      {recurring && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Repetir a cada</span>
          <Input
            type="number"
            className="w-20"
            value={recurringIntervalDays}
            onChange={(e) => onIntervalChange(Number(e.target.value))}
          />
          <span className="text-sm text-muted-foreground">dias</span>
        </div>
      )}

      {selectedDate && (
        <div className="space-y-3">
          {loadingTimes ? (
            <p className="text-sm text-muted-foreground">Carregando horários...</p>
          ) : periods.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum horário livre neste dia.</p>
          ) : (
            periods.map((g) => (
              <div key={g.label}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  {g.times.map((t) => (
                    <button
                      key={t}
                      onClick={() => onSelectTime(t)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        selectedTime === t && "border-primary bg-primary/10 font-medium text-primary",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1" disabled={!selectedDate || !selectedTime} onClick={onContinue}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
