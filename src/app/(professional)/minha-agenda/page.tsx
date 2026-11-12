import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { getOwnDayData, getOwnWeekData } from "@/features/professionals/service";
import { getAgendaMonthSummary } from "@/features/appointments/service";
import { MonthGrid } from "@/features/appointments/components/month-grid";
import { DateJump } from "@/features/appointments/components/date-jump";
import { cn } from "@/lib/utils";
import { withAppContext } from "@/server/db/context";
import { ttlCached } from "@/server/db/ttl-cache";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewAppointmentDialog } from "@/features/appointments/components/new-appointment-dialog";
import { BlockTimeDialog } from "@/features/appointments/components/block-time-dialog";
import { CalendarBoard } from "@/features/appointments/components/calendar-board";
import { formatBRL } from "@/shared/lib/format";

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
  const mode: "dia" | "semana" | "mes" = view === "semana" ? "semana" : view === "mes" ? "mes" : "dia";
  const isWeek = mode === "semana";

  // Setas: dia a dia, semana a semana ou mês a mês, conforme a visão.
  const prevDate =
    mode === "mes"
      ? new Date(date.getFullYear(), date.getMonth() - 1, 1)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate() - (isWeek ? 7 : 1));
  const nextDate =
    mode === "mes"
      ? new Date(date.getFullYear(), date.getMonth() + 1, 1)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate() + (isWeek ? 7 : 1));
  const link = (m: string, d: Date | string) =>
    `/minha-agenda?view=${m}&date=${typeof d === "string" ? d : toISODate(d)}`;

  // A unidade quase nunca muda, mas essa consulta rodava em série ANTES dos
  // dados da agenda — uma transação inteira (~470ms até us-east-1) a cada
  // troca de dia. Chave por profissional: a RLS decide qual unidade ele vê.
  const unit = await ttlCached(`minha-agenda:unit:${ctx.userId}`, 60_000, () =>
    withAppContext(ctx, (tx) => tx.unit.findFirstOrThrow()),
  );
  const professionalOption = [{ id: ctx.userId, name: "Você", color: "#F5B301" }];

  const dateLabel =
    mode === "mes"
      ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date)
      : new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(date);

  return (
    <main className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Minha Agenda</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus atendimentos</p>
        </div>
        <div className="flex overflow-hidden rounded-md border text-sm">
          {(
            [
              ["dia", "Dia"],
              ["semana", "Semana"],
              ["mes", "Mês"],
            ] as const
          ).map(([m, label]) => (
            <Link
              key={m}
              href={link(m, dateISO)}
              prefetch={false}
              className={cn("px-3 py-1.5", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={link(mode, dateISO)}>
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

      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        <Link href={link(mode, prevDate)} prefetch={false} className="rounded-md border p-1.5 hover:bg-accent">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-48 text-center text-sm font-medium capitalize">
          {isWeek ? `Semana de ${dateLabel}` : dateLabel}
        </span>
        <Link href={link(mode, nextDate)} prefetch={false} className="rounded-md border p-1.5 hover:bg-accent">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <DateJump basePath="/minha-agenda" view={mode} dateISO={dateISO} mode={mode === "mes" ? "month" : "day"} />
        <Link
          href={link(mode, toISODate(new Date()))}
          prefetch={false}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Hoje
        </Link>
      </div>

      {mode === "mes" ? (
        <OwnMonthView ctx={ctx} date={date} />
      ) : isWeek ? (
        <WeekView ctx={ctx} startDate={date} />
      ) : (
        <DayView ctx={ctx} date={date} dateISO={dateISO} unitId={unit.id} />
      )}
    </main>
  );
}

async function DayView({
  ctx,
  date,
  dateISO,
  unitId,
}: {
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;
  date: Date;
  dateISO: string;
  unitId: string;
}) {
  const { professional, appointments, blockedSlots, kpis } = await getOwnDayData({ ctx, date });
  // totalPrice/priceAtBooking (Decimal) não atravessam a fronteira Server -> Client Component.
  const data = {
    professionals: [professional],
    appointments: appointments.map((a) => ({
      ...a,
      totalPrice: Number(a.totalPrice),
      // Linhas de serviço já em number/string puros pro painel do agendamento
      // (priceAtBooking é Decimal e não atravessa pra Client Component).
      serviceLines: a.services.map((s) => ({
        name: s.service.name,
        durationMinutes: s.durationAtBooking,
        price: Number(s.priceAtBooking),
      })),
      products: a.products.map((p) => ({ ...p, priceAtBooking: Number(p.priceAtBooking) })),
      couponRedemptions: a.couponRedemptions.map((r) => ({
        ...r,
        discountApplied: Number(r.discountApplied),
        coupon: { ...r.coupon, discountValue: Number(r.coupon.discountValue) },
      })),
    })),
    blockedSlots,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = date.getTime() === today.getTime();

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

      {/* Mesma grade da Agenda Mestre do admin, só com a própria coluna —
          arrastar/redimensionar funciona igual, mas não pode forçar
          sobreposição (só admin pode). */}
      <CalendarBoard data={data} unitId={unitId} dateISO={dateISO} isToday={isToday} canForceOverlap={false} />
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

/** Visão Mês: quantos agendamentos e concluídos o profissional tem em cada dia; toque abre o dia. */
async function OwnMonthView({ ctx, date }: { ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>; date: Date }) {
  const year = date.getFullYear();
  const month = date.getMonth();
  // Colunas @db.Date são meia-noite UTC: limites do mês na mesma âncora.
  const summary = await getAgendaMonthSummary({
    ctx,
    monthStart: new Date(Date.UTC(year, month, 1)),
    monthEnd: new Date(Date.UTC(year, month + 1, 0)),
  });
  return (
    <MonthGrid year={year} month={month} summary={summary} dayHref={(iso) => `/minha-agenda?view=dia&date=${iso}`} />
  );
}
