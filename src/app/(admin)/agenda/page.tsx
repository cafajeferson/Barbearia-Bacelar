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

export default async function AgendaMestrePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { date: dateParam, view: viewParam } = await searchParams;
  const view = viewParam === "month" ? "month" : "day";
  const date = parseDateParam(dateParam);
  const dateISO = toISODate(date);

  const [unit, professionals] = await Promise.all([
    withAppContext(ctx, (tx) => tx.unit.findFirstOrThrow()),
    withAppContext(ctx, (tx) =>
      tx.professional.findMany({ where: { active: true }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    ),
  ]);

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
              href={`/agenda?date=${dateISO}&view=day`}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium",
                view === "day" ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <CalendarDays className="h-4 w-4" /> Dia
            </Link>
            <Link
              href={`/agenda?date=${dateISO}&view=month`}
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
        <DayView ctx={ctx} date={date} dateISO={dateISO} isToday={isToday} unitId={unit.id} />
      ) : (
        <MonthView ctx={ctx} date={date} />
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
}: {
  ctx: Awaited<ReturnType<typeof getAuthContext>>;
  date: Date;
  dateISO: string;
  isToday: boolean;
  unitId: string;
}) {
  if (!ctx) return null;
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);

  const rawData = await getAgendaMestreData({ ctx, date });
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
          <Link href={`/agenda?date=${toISODate(prevDate)}&view=day`} className="rounded-md border p-1.5 hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-56 text-center font-medium capitalize">{dateLabel}</span>
          <Link href={`/agenda?date=${toISODate(nextDate)}&view=day`} className="rounded-md border p-1.5 hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {!isToday && (
          <Link href="/agenda?view=day" className="text-xs text-primary underline underline-offset-2">
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
}: {
  ctx: Awaited<ReturnType<typeof getAuthContext>>;
  date: Date;
}) {
  if (!ctx) return null;
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const summary = await getAgendaMonthSummary({ ctx, monthStart, monthEnd });

  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthStart);

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <Link href={`/agenda?date=${toISODate(prevMonth)}&view=month`} className="rounded-md border p-1.5 hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-56 text-center font-medium capitalize">{monthLabel}</span>
          <Link href={`/agenda?date=${toISODate(nextMonth)}&view=month`} className="rounded-md border p-1.5 hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {!isCurrentMonth && (
          <Link href="/agenda?view=month" className="text-xs text-primary underline underline-offset-2">
            Ir para este mês
          </Link>
        )}
      </div>

      <MonthGrid year={year} month={month} summary={summary} />
    </>
  );
}
