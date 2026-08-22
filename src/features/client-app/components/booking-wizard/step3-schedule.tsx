"use client";

import { useEffect, useMemo, useState } from "react";
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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
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
  const days = useMemo(() => {
    const arr: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  const [levels, setLevels] = useState<Record<string, "MUITOS" | "POUCOS" | "NENHUM">>({});
  const [times, setTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);

  useEffect(() => {
    const months = new Set(days.map((d) => `${d.getFullYear()}-${d.getMonth()}`));
    Promise.all(
      Array.from(months).map((key) => {
        const [year, month] = key.split("-").map(Number);
        return getMonthAvailabilityAction({ professionalIds, year, month, durationMinutes });
      }),
    ).then((results) => {
      setLevels(Object.assign({}, ...results));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionalIds.join(","), durationMinutes]);

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingTimes(true);
    getUnionAvailableSlotsAction({ professionalIds, date: isoDate(selectedDate), durationMinutes })
      .then(setTimes)
      .finally(() => setLoadingTimes(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate?.getTime(), professionalIds.join(","), durationMinutes]);

  const periods = groupByPeriod(times);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Escolha o horário</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const iso = isoDate(d);
          const active = selectedDate && isoDate(selectedDate) === iso;
          const level = levels[iso];
          return (
            <button
              key={iso}
              onClick={() => onSelectDate(d)}
              className={cn(
                "flex w-14 shrink-0 flex-col items-center gap-1 rounded-lg border p-2",
                active && "border-primary bg-primary/10",
              )}
            >
              <span className="text-[10px] uppercase text-muted-foreground">
                {new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(d)}
              </span>
              <span className="text-sm font-medium">{d.getDate()}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", level ? LEVEL_COLOR[level] : "bg-muted")} />
            </button>
          );
        })}
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
