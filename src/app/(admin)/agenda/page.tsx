import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { getAgendaMestreData } from "@/features/appointments/service";
import { CalendarBoard } from "@/features/appointments/components/calendar-board";
import { NewAppointmentDialog } from "@/features/appointments/components/new-appointment-dialog";
import { BlockTimeDialog } from "@/features/appointments/components/block-time-dialog";
import { withAppContext } from "@/server/db/context";

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
  searchParams: Promise<{ date?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { date: dateParam } = await searchParams;
  const date = parseDateParam(dateParam);
  const dateISO = toISODate(date);

  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);

  const [rawData, unit] = await Promise.all([
    getAgendaMestreData({ ctx, date }),
    withAppContext(ctx, (tx) => tx.unit.findFirstOrThrow()),
  ]);
  // totalPrice (Decimal) não atravessa a fronteira Server -> Client Component.
  const data = {
    ...rawData,
    appointments: rawData.appointments.map((a) => ({ ...a, totalPrice: Number(a.totalPrice) })),
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = date.getTime() === today.getTime();

  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agenda Mestre</h1>
          <p className="text-muted-foreground">Visão geral de todos os agendamentos</p>
        </div>
        <div className="flex items-center gap-2">
          <BlockTimeDialog
            professionals={data.professionals.map((p) => ({ id: p.id, name: p.name }))}
            defaultDate={dateISO}
          />
          <NewAppointmentDialog
            professionals={data.professionals}
            defaultDate={dateISO}
            unitId={unit.id}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Link
          href={`/agenda?date=${toISODate(prevDate)}`}
          className="rounded-md border p-1.5 hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-56 text-center font-medium capitalize">{dateLabel}</span>
        <Link
          href={`/agenda?date=${toISODate(nextDate)}`}
          className="rounded-md border p-1.5 hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <CalendarBoard data={data} unitId={unit.id} dateISO={dateISO} isToday={isToday} />
    </main>
  );
}
