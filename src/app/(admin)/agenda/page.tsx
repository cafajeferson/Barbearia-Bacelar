import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { getAgendaMestreData, getAgendaMonthSummary } from "@/features/appointments/service";
import { CalendarBoard } from "@/features/appointments/components/calendar-board";
import { MonthGrid } from "@/features/appointments/components/month-grid";
import { AgendaToolbar } from "@/features/appointments/components/agenda-toolbar";
import { NewAppointmentDialog } from "@/features/appointments/components/new-appointment-dialog";
import { BlockTimeDialog } from "@/features/appointments/components/block-time-dialog";
import { withAppContext } from "@/server/db/context";
import { cn } from "@/lib/utils";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDateParam(value: string | undefined): Date {
  const d = value ? new Date(`${value}T00:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "Período" da barra global (topo do admin) — só a Agenda Mestre reage a ele por enquanto. Formato "YYYY-MM". */
function resolveFromPeriod(period: string | undefined): { date: Date; view: "day" | "month" } | null {
  if (!period || period === "all") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const [, year, month] = match;
  return { date: new Date(Number(year), Number(month) - 1, 1), view: "month" };
}

export default async function AgendaMestrePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; period?: string; unit?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { date: dateParam, view: viewParam, period, unit: unitParam } = await searchParams;
  const unitId = unitParam && unitParam !== "all" ? unitParam : undefined;

  // date/view explícitos (setados ao navegar dia a dia, clicar num dia do
  // mês, etc.) sempre ganham — "período" só decide o padrão quando a URL
  // ainda não tem uma data própria (ver AdminTopbar, que limpa date/view
  // ao trocar o período pra garantir essa prioridade).
  const fromPeriod = !dateParam && !viewParam ? resolveFromPeriod(period) : null;
  const view = fromPeriod?.view ?? (viewParam === "month" ? "month" : "day");
  const date = fromPeriod?.date ?? parseDateParam(dateParam);
  const dateISO = toISODate(date);

  // Uma única transação pras duas consultas — abrir uma pra cada esgotou o
  // pool de conexões do pooler algumas vezes (P2028 "Unable to start a
  // transaction"), especialmente combinado com o que o layout já abre.
  const { unit, professionals } = await withAppContext(ctx, async (tx) => {
    const [unit, professionals] = await Promise.all([
      tx.unit.findFirstOrThrow(),
      tx.professional.findMany({
        where: { active: true, units: unitId ? { some: { unitId } } : undefined },
        orderBy: { name: "asc" },
      }),
    ]);
    return { unit, professionals };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = date.getTime() === today.getTime();

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agenda Mestre</h1>
          <p className="text-muted-foreground">Visão geral de todos os agendamentos</p>
        </div>
        <div className="flex items-center gap-2">
          <AgendaToolbar />
          <BlockTimeDialog professionals={professionals} defaultDate={dateISO} />
          <NewAppointmentDialog professionals={professionals} defaultDate={dateISO} unitId={unit.id} />
          <div className="ml-1 flex items-center overflow-hidden rounded-md border">
            <Link
              href={`/agenda?date=${dateISO}&view=day${unitId ? `&unit=${unitId}` : ""}`}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium",
                view === "day" ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <CalendarDays className="h-4 w-4" /> Dia
            </Link>
            <Link
              href={`/agenda?date=${dateISO}&view=month${unitId ? `&unit=${unitId}` : ""}`}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium",
                view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <CalendarRange className="h-4 w-4" /> Mês
            </Link>
          </div>
        </div>
      </div>

      {view === "day" ? (
        <DayView
          ctx={ctx}
          date={date}
          dateISO={dateISO}
          isToday={isToday}
          unitId={unit.id}
          unitFilter={unitId}
          professionals={professionals}
        />
      ) : (
        <MonthView ctx={ctx} date={date} unitId={unitId} />
      )}
    </main>
  );
}

async function DayView({
  ctx,
  date,
  dateISO,
  isToday,
  unitId,
  unitFilter,
  professionals,
}: {
  ctx: Awaited<ReturnType<typeof getAuthContext>>;
  date: Date;
  dateISO: string;
  isToday: boolean;
  unitId: string;
  unitFilter: string | undefined;
  professionals: Parameters<typeof getAgendaMestreData>[0]["professionals"];
}) {
  if (!ctx) return null;
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const unitQs = unitFilter ? `&unit=${unitFilter}` : "";

  const rawData = await getAgendaMestreData({ ctx, date, unitId: unitFilter, professionals });
  // totalPrice/priceAtBooking (Decimal) não atravessam a fronteira Server -> Client Component.
  const data = {
    ...rawData,
    appointments: rawData.appointments.map((a) => ({
      ...a,
      totalPrice: Number(a.totalPrice),
      products: a.products.map((p) => ({ ...p, priceAtBooking: Number(p.priceAtBooking) })),
    })),
  };

  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <Link href={`/agenda?date=${toISODate(prevDate)}&view=day${unitQs}`} className="rounded-md border p-1.5 hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-56 text-center font-medium capitalize">{dateLabel}</span>
          <Link href={`/agenda?date=${toISODate(nextDate)}&view=day${unitQs}`} className="rounded-md border p-1.5 hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {!isToday && (
          <Link href={`/agenda?view=day${unitQs}`} className="text-xs text-primary underline underline-offset-2">
            Ir para hoje
          </Link>
        )}
      </div>

      <CalendarBoard data={data} unitId={unitId} dateISO={dateISO} isToday={isToday} />
    </>
  );
}

async function MonthView({
  ctx,
  date,
  unitId,
}: {
  ctx: Awaited<ReturnType<typeof getAuthContext>>;
  date: Date;
  unitId: string | undefined;
}) {
  if (!ctx) return null;
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const summary = await getAgendaMonthSummary({ ctx, monthStart, monthEnd, unitId });

  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const unitQs = unitId ? `&unit=${unitId}` : "";

  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthStart);

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <Link href={`/agenda?date=${toISODate(prevMonth)}&view=month${unitQs}`} className="rounded-md border p-1.5 hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-56 text-center font-medium capitalize">{monthLabel}</span>
          <Link href={`/agenda?date=${toISODate(nextMonth)}&view=month${unitQs}`} className="rounded-md border p-1.5 hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {!isCurrentMonth && (
          <Link href={`/agenda?view=month${unitQs}`} className="text-xs text-primary underline underline-offset-2">
            Ir para este mês
          </Link>
        )}
      </div>

      <MonthGrid year={year} month={month} summary={summary} unitId={unitId} />
    </>
  );
}
