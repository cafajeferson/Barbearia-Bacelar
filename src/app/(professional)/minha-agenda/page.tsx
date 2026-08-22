import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight, RefreshCw, Ban } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { getOwnDayData, getOwnWeekData } from "@/features/professionals/service";
import { withAppContext } from "@/server/db/context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewAppointmentDialog } from "@/features/appointments/components/new-appointment-dialog";
import { BlockTimeDialog } from "@/features/appointments/components/block-time-dialog";
import { AppointmentStatusActions } from "@/features/professionals/components/appointment-status-actions";
import { formatBRL, initials } from "@/shared/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDateParam(value: string | undefined): Date {
  const d = value ? new Date(`${value}T00:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function MinhaAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "PROFESSIONAL" || !ctx.userId) return null;

  const { date: dateParam, view } = await searchParams;
  const date = parseDateParam(dateParam);
  const dateISO = toISODate(date);
  const isWeek = view === "semana";

  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - (isWeek ? 7 : 1));
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + (isWeek ? 7 : 1));

  const unit = await withAppContext(ctx, (tx) => tx.unit.findFirstOrThrow());
  const professionalOption = [{ id: ctx.userId, name: "Você", color: "#F5B301" }];

  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);

  return (
    <main className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Minha Agenda</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus atendimentos</p>
        </div>
        <Link href={`/minha-agenda?view=${isWeek ? "dia" : "semana"}&date=${dateISO}`}>
          <Button variant="outline" size="sm">
            {isWeek ? "Ver Dia" : "Ver Semana"}
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/minha-agenda?view=${isWeek ? "semana" : "dia"}&date=${dateISO}`}>
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </Link>
        <BlockTimeDialog professionals={professionalOption} defaultDate={dateISO} />
        <NewAppointmentDialog
          professionals={professionalOption}
          defaultDate={dateISO}
          unitId={unit.id}
          triggerLabel="Agendar horário"
        />
      </div>

      <div className="flex items-center justify-center gap-4">
        <Link
          href={`/minha-agenda?view=${isWeek ? "semana" : "dia"}&date=${toISODate(prevDate)}`}
          className="rounded-md border p-1.5 hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-48 text-center text-sm font-medium capitalize">
          {isWeek ? `Semana de ${dateLabel}` : dateLabel}
        </span>
        <Link
          href={`/minha-agenda?view=${isWeek ? "semana" : "dia"}&date=${toISODate(nextDate)}`}
          className="rounded-md border p-1.5 hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {isWeek ? <WeekView ctx={ctx} startDate={date} /> : <DayView ctx={ctx} date={date} />}
    </main>
  );
}

async function DayView({ ctx, date }: { ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>; date: Date }) {
  const { appointments, blockedSlots, kpis } = await getOwnDayData({ ctx, date });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Agendamentos</p>
          <p className="text-xl font-semibold">{kpis.waitingCount}</p>
          <p className="text-[10px] text-muted-foreground">aguardando atendimento</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Concluídos</p>
          <p className="text-xl font-semibold">{kpis.completedCount}</p>
          <p className="text-[10px] text-muted-foreground">no dia</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Receita</p>
          <p className="text-xl font-semibold">{formatBRL(kpis.revenue)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Pendente</p>
          <p className="text-xl font-semibold">{formatBRL(kpis.pending)}</p>
          <p className="text-[10px] text-muted-foreground">a receber</p>
        </Card>
      </div>

      {blockedSlots.length > 0 && (
        <div className="space-y-1">
          {blockedSlots.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-md border border-dashed p-2 text-sm text-muted-foreground">
              <Ban className="h-4 w-4" />
              {b.startTime}–{b.endTime} · {b.reason ?? "Bloqueado"}
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Agenda do dia</h2>
        {appointments.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <CalendarPlus className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhum agendamento</p>
            <p className="text-xs text-muted-foreground">Você não tem atendimentos para este dia.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {appointments.map((a) => (
              <Card key={a.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                      {initials(a.client.name)}
                    </div>
                    <div>
                      <p className="font-medium">{a.client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.services.map((s) => s.service.name).join(" + ")} · {a.startTime}–{a.endTime}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={a.status === "COMPLETED" ? "default" : "outline"}
                    className={cn(a.status === "NO_SHOW" && "text-destructive")}
                  >
                    {STATUS_LABEL[a.status]}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{formatBRL(Number(a.totalPrice))}</span>
                  <AppointmentStatusActions appointmentId={a.id} status={a.status} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function WeekView({ ctx, startDate }: { ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>; startDate: Date }) {
  const appointments = await getOwnWeekData({ ctx, startDate });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="space-y-4">
      {days.map((d) => {
        const dayAppointments = appointments.filter(
          (a) => toISODate(a.scheduledDate) === toISODate(d),
        );
        return (
          <div key={toISODate(d)}>
            <h2 className="mb-1 text-sm font-semibold capitalize text-muted-foreground">
              {new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }).format(d)}
            </h2>
            {dayAppointments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem atendimentos.</p>
            ) : (
              <div className="space-y-1">
                {dayAppointments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>
                      {a.startTime} · {a.client.name} — {a.services.map((s) => s.service.name).join(" + ")}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {STATUS_LABEL[a.status]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
