import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportPeriod } from "../service";

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "dia", label: "Dia" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "personalizado", label: "Personalizado" },
];

export function shiftDate(dateISO: string, period: ReportPeriod, direction: 1 | -1) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const next =
    period === "dia"
      ? new Date(Date.UTC(y, m - 1, d + direction))
      : period === "semana"
        ? new Date(Date.UTC(y, m - 1, d + 7 * direction))
        : new Date(Date.UTC(y, m - 1 + direction, 1));
  return next.toISOString().slice(0, 10);
}

export function periodTitle(period: ReportPeriod, startISO: string, endISO: string) {
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  const fmt = (o: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...o }).format(d);
  if (period === "dia") return fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, start);
  if (period === "mes") return fmt({ month: "long", year: "numeric" }, start);
  const full = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
  if (period === "personalizado") return `${fmt(full, start)} a ${fmt(full, end)}`;
  return `${fmt({ day: "2-digit", month: "2-digit" }, start)} a ${fmt(full, end)}`;
}

export type PeriodHref = (over: { periodo?: ReportPeriod; data?: string; de?: string; ate?: string }) => string;

/**
 * Seletor de período dos Relatórios: Dia / Semana / Mês com setas, ou
 * "Personalizado" com data inicial e final livres ("de tal data a tal data").
 */
export function PeriodControls({
  period,
  dateISO,
  startISO,
  endISO,
  href,
  basePath,
  hidden,
}: {
  period: ReportPeriod;
  dateISO: string;
  startISO: string;
  endISO: string;
  href: PeriodHref;
  basePath: string;
  /** Campos que o formulário do personalizado precisa manter (aba, colaborador, busca). */
  hidden: Record<string, string | null | undefined>;
}) {
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 overflow-x-auto rounded-full border border-border/60 bg-card p-1">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={p.value === "personalizado" ? href({ periodo: p.value, de: startISO, ate: endISO }) : href({ periodo: p.value })}
            prefetch={false}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium",
              period === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {period === "personalizado" ? (
        <form action={basePath} className="flex flex-wrap items-end gap-2">
          {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <input type="hidden" name="periodo" value="personalizado" />
          <label>
            <span className="mb-1 block text-xs text-muted-foreground">De</span>
            <input type="date" name="de" defaultValue={startISO} max={todayISO} required className="h-10 rounded-full border border-border/60 bg-card px-3 text-sm" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted-foreground">Até</span>
            <input type="date" name="ate" defaultValue={endISO} required className="h-10 rounded-full border border-border/60 bg-card px-3 text-sm" />
          </label>
          <button type="submit" className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            Aplicar
          </button>
          <span className="pb-2 text-sm text-muted-foreground">{periodTitle(period, startISO, endISO)}</span>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          <Link href={href({ data: shiftDate(dateISO, period, -1) })} prefetch={false} className="rounded-full border border-border/60 p-2 hover:bg-accent" aria-label="Período anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="px-2 text-sm font-medium first-letter:uppercase">{periodTitle(period, startISO, endISO)}</span>
          <Link href={href({ data: shiftDate(dateISO, period, 1) })} prefetch={false} className="rounded-full border border-border/60 p-2 hover:bg-accent" aria-label="Próximo período">
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href={href({ data: todayISO })} prefetch={false} className="ml-1 rounded-full border border-border/60 px-3 py-1.5 text-sm hover:bg-accent">
            Hoje
          </Link>
        </div>
      )}
    </div>
  );
}
