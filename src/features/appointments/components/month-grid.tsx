import Link from "next/link";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function MonthGrid({
  year,
  month, // 0-indexed
  summary,
  unitId,
}: {
  year: number;
  month: number;
  summary: Map<string, { total: number; completed: number }>;
  unitId?: string;
}) {
  const unitQs = unitId ? `&unit=${unitId}` : "";
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toISODate(today);

  type Cell = { date: Date; inMonth: boolean };
  const cells: Cell[] = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-card">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ date, inMonth }, i) => {
          const iso = toISODate(date);
          const isToday = iso === todayISO;
          const counts = summary.get(iso);
          return (
            <Link
              key={i}
              href={`/agenda?date=${iso}&view=day${unitQs}`}
              // Até 42 células por mês — com prefetch automático (padrão do
              // Next), isso disparava 42 renderizações completas da Agenda
              // Mestre (cada uma abrindo transação no banco) só de a grade
              // aparecer na tela. A pessoa clica em UM dia, não em 42.
              prefetch={false}
              className={cn(
                "flex min-h-24 flex-col gap-1 border-b border-r p-2 text-sm transition-colors hover:bg-accent",
                (i + 1) % 7 === 0 && "border-r-0",
                !inMonth && "text-muted-foreground/40",
                isToday && "bg-primary/5",
              )}
            >
              <span className={cn("font-semibold", isToday && "text-primary")}>{date.getDate()}</span>
              {inMonth && counts && (
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {counts.total} agend.
                  </p>
                  <p className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    {counts.completed} concl.
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
