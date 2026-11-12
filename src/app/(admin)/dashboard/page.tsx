import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  Clock,
  DollarSign,
  Medal,
  Scissors,
  Trophy,
  UserX,
} from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { getDashboardData } from "@/features/dashboard/service";
import { AreaChart, DonutChart } from "@/features/reports/components/charts";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateLong, initials } from "@/shared/lib/format";
import { cn } from "@/lib/utils";

function greeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Mesmo bloco visual dos Relatórios. */
function Panel({
  title,
  sub,
  icon: Icon,
  className,
  action,
  children,
}: {
  title: string;
  sub?: string;
  icon?: typeof Trophy;
  className?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            {Icon && <Icon className="h-4 w-4 text-primary" />} {title}
          </h2>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-muted-foreground">{label}</span>;
  const up = value >= 0;
  return (
    <>
      <span className={cn("flex items-center font-medium", up ? "text-success" : "text-destructive")}>
        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(value).toFixed(1)}%
      </span>
      <span className="text-muted-foreground">{label}</span>
    </>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  highlight,
  footer,
  children,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  highlight?: boolean;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        highlight ? "border-primary/40 bg-gradient-to-br from-primary/20 via-card to-card" : "border-border/60 bg-card/80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight sm:text-3xl", highlight && "text-primary")}>{value}</p>
      {footer && <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">{footer}</p>}
      {children}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-2", strong ? "font-medium text-foreground" : "text-muted-foreground")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; unit?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  // Filtros globais da barra do topo (Período / Unidade) — antes o dashboard
  // os ignorava e mostrava sempre "tudo", qualquer que fosse a seleção.
  const { period, unit } = await searchParams;
  const periodMatch = period?.match(/^(\d{4})-(\d{2})$/);
  const periodStart = periodMatch ? new Date(Number(periodMatch[1]), Number(periodMatch[2]) - 1, 1) : undefined;

  const data = await getDashboardData({ ctx, unitId: unit || undefined, periodStart });
  const now = new Date();
  // Mês já passado escolhido na barra do topo: os cartões mostram aquele mês em vez de "hoje".
  const pastMonth = data.period && !data.period.isCurrentMonth ? data.period : null;
  const periodLabel = periodStart
    ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(periodStart)
    : "todos os meses";
  const refDay = periodStart ?? now;
  const reportHref = (q?: string) => {
    const p = new URLSearchParams({
      aba: "servicos",
      periodo: "mes",
      data: `${refDay.getFullYear()}-${String(refDay.getMonth() + 1).padStart(2, "0")}-01`,
    });
    if (q) p.set("q", q);
    return `/relatorios?${p.toString()}`;
  };
  const servicesTotal = data.popularServices.reduce((s, x) => s + x.count, 0);
  const maxRanking = data.ranking[0]?.revenue || 1;

  return (
    <main className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{greeting(data.greetingHour)}</h1>
          <p className="capitalize text-muted-foreground">{formatDateLong(now)}</p>
        </div>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm capitalize text-primary">
          {periodLabel}
        </span>
      </div>

      {data.openAppointments.count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-warning/20 p-2 text-warning">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">Atendimentos em aberto</p>
              <p className="text-2xl font-semibold">{data.openAppointments.count}</p>
              {data.openAppointments.oldest && (
                <p className="text-xs text-muted-foreground">
                  Mais antigo — {data.openAppointments.oldest.client.name} com{" "}
                  {data.openAppointments.oldest.professional.name}
                </p>
              )}
            </div>
          </div>
          <Button asChild>
            <Link href="/em-aberto">Fechar agora</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {pastMonth ? (
          <>
            <Kpi
              label="Receita do mês"
              value={formatBRL(pastMonth.revenue)}
              icon={DollarSign}
              highlight
              footer={<Delta value={pastMonth.revenueChangePct} label="vs mês anterior" />}
            >
              <div className="mt-2 space-y-0.5 text-xs">
                <Row label="Serviços" value={formatBRL(pastMonth.revenue - pastMonth.productsRevenue)} />
                <Row label="Produtos" value={formatBRL(pastMonth.productsRevenue)} />
              </div>
            </Kpi>
            <Kpi
              label="Agendamentos"
              value={String(pastMonth.appointments)}
              icon={CalendarCheck}
              footer={<span className="text-muted-foreground">{pastMonth.completed} concluídos no mês</span>}
            />
            <Kpi
              label="Ticket médio"
              value={formatBRL(pastMonth.averageTicket)}
              icon={Scissors}
              footer={<span className="text-muted-foreground">por atendimento concluído</span>}
            />
          </>
        ) : (
          <>
            <Kpi
              label="Receita de hoje"
              value={formatBRL(data.kpis.revenueToday)}
              icon={DollarSign}
              highlight
              footer={<Delta value={data.kpis.revenueChangePct} label="vs ontem" />}
            >
              <div className="mt-2 space-y-0.5 text-xs">
                <Row label="Ontem" value={formatBRL(data.kpis.revenueYesterday)} />
                <Row label="Mês" value={formatBRL(data.kpis.revenueMonth)} strong />
              </div>
            </Kpi>
            <Kpi
              label="Agendamentos hoje"
              value={String(data.kpis.appointmentsToday)}
              icon={CalendarCheck}
              footer={<span className="text-muted-foreground">vs ontem ({data.kpis.appointmentsYesterday})</span>}
            />
            <Kpi
              label="Pendentes"
              value={String(data.kpis.pendingCount)}
              icon={CalendarClock}
              footer={<span className="text-muted-foreground">a realizar</span>}
            />
          </>
        )}
        <Kpi
          label="No-show"
          value={`${data.kpis.noShowRate.toFixed(1)}%`}
          icon={UserX}
          footer={<span className="text-muted-foreground">faltas no período</span>}
        >
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
              style={{ width: `${Math.min(100, data.kpis.noShowRate)}%` }}
            />
          </div>
        </Kpi>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel
          title="Faturamento"
          sub={periodStart ? "dia a dia no mês (serviços + produtos)" : "mês a mês (serviços + produtos)"}
          className="lg:col-span-2"
          action={
            <Link href={reportHref()} prefetch={false} className="text-xs text-primary hover:underline">
              Ver relatório
            </Link>
          }
        >
          {data.series.some((p) => p.value > 0) ? (
            <AreaChart points={data.series} valueLabel={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem atendimentos concluídos no período.</p>
          )}
        </Panel>
        <Panel title="Serviços populares" sub="toque para abrir no relatório" icon={Scissors}>
          {data.popularServices.length ? (
            <DonutChart
              slices={data.popularServices.map((s) => ({ label: s.name, value: s.count }))}
              centerLabel={String(servicesTotal)}
              centerSub="serviços"
              hrefFor={(label) => reportHref(label)}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Sem dados no período.</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Ranking" sub="faturamento em serviços por colaborador" icon={Trophy}>
          {data.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem atendimentos concluídos no período.</p>
          ) : (
            <ul className="space-y-4">
              {data.ranking.map((p, i) => (
                <li key={p.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <Medal
                        className={cn(
                          "h-4 w-4 shrink-0",
                          i === 0 ? "text-primary" : i === 1 ? "text-muted-foreground" : "text-warning/70",
                        )}
                      />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums">
                      <span className="font-semibold">{formatBRL(p.revenue)}</span>{" "}
                      <span className="text-xs text-muted-foreground">{p.count} atend.</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
                      style={{ width: `${Math.max(3, (p.revenue / maxRanking) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Painel" sub={periodStart ? `números de ${periodLabel}` : "todo o histórico"}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Clientes</p>
              <p className="text-lg font-semibold">
                {data.painel.totalClients}{" "}
                <span className="text-xs font-normal text-success">+{data.painel.newClientsInPeriod} novos</span>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Profissionais ativos</p>
              <p className="text-lg font-semibold">{data.painel.activeProfessionals}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Comissões</p>
              <p className="text-lg font-semibold">{formatBRL(data.painel.commissionsInPeriod)}</p>
              <p className="text-xs text-muted-foreground">
                {data.painel.commissionsPending > 0
                  ? `${formatBRL(data.painel.commissionsPending)} a pagar`
                  : data.painel.commissionsInPeriod > 0
                    ? "tudo pago"
                    : ""}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">MRR</p>
              <p className="text-lg font-semibold text-primary">{formatBRL(data.painel.mrr)}</p>
              <p className="text-xs text-muted-foreground">mensalidades ativas</p>
            </div>
            <div>
              <p className="text-muted-foreground">Assinaturas ativas</p>
              <p className="text-lg font-semibold">{data.painel.activeSubscriptions}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Cancelamentos</p>
              <p className="text-lg font-semibold">{data.painel.cancellationsInPeriod}</p>
            </div>
          </div>
        </Panel>

        <Panel title="Próximos" sub="agendamentos a seguir" icon={CalendarClock}>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {data.upcoming.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                    {initials(a.client.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.client.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.services.map((s) => s.service.name).join(" + ")} · {a.professional.name}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{a.startTime}</p>
                    <p>
                      {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(
                        a.scheduledDate,
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Atividade recente" icon={Activity}>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem atividade registrada ainda.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {data.recentActivity.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{describeActivity(log.action)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
                    log.createdAt,
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}

function describeActivity(action: string): string {
  const map: Record<string, string> = {
    APPOINTMENT_CREATED: "Novo agendamento criado",
    APPOINTMENT_FORCED_OVERLAP: "Agendamento com sobreposição forçada",
    APPOINTMENT_RESCHEDULED: "Agendamento reagendado",
    APPOINTMENT_STATUS_OVERRIDE: "Status de agendamento alterado manualmente",
    CLIENT_AUTO_BLOCKED_NOSHOW: "Cliente bloqueado automaticamente por no-show",
    SUBSCRIPTION_PAYMENT: "Mensalidade de assinatura registrada",
  };
  return map[action] ?? action;
}
