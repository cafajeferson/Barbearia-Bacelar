import Link from "next/link";
import { Clock, TrendingUp, TrendingDown, Trophy, Medal, Scissors } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { getDashboardData } from "@/features/dashboard/service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBRL, formatDateLong, formatPercent, initials } from "@/shared/lib/format";
import { cn } from "@/lib/utils";

function greeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        {icon}
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      {sub}
    </Card>
  );
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const data = await getDashboardData({ ctx });
  const now = new Date();

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting(data.greetingHour)}
        </h1>
        <p className="capitalize text-muted-foreground">{formatDateLong(now)}</p>
      </div>

      {data.openAppointments.count > 0 && (
        <Card className="flex items-center justify-between gap-4 border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-warning/20 p-2 text-warning">
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
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Receita"
          value={formatBRL(data.kpis.revenueToday)}
          sub={
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Hoje</span>
                <span>{formatBRL(data.kpis.revenueToday)}</span>
              </div>
              <div className="flex justify-between">
                <span>Ontem</span>
                <span>{formatBRL(data.kpis.revenueYesterday)}</span>
              </div>
              <div className="flex justify-between font-medium text-foreground">
                <span>Mês</span>
                <span className="flex items-center gap-1">
                  {formatBRL(data.kpis.revenueMonth)}
                  {data.kpis.revenueChangePct !== null && (
                    <span
                      className={cn(
                        "flex items-center gap-0.5 text-xs",
                        data.kpis.revenueChangePct >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {data.kpis.revenueChangePct >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {formatPercent(data.kpis.revenueChangePct, { signed: true })}
                    </span>
                  )}
                </span>
              </div>
            </div>
          }
        />
        <KpiCard
          label="Agendamentos"
          value={String(data.kpis.appointmentsToday)}
          sub={
            <p className="text-xs text-muted-foreground">
              vs ontem ({data.kpis.appointmentsYesterday})
            </p>
          }
        />
        <KpiCard
          label="Pendentes"
          value={String(data.kpis.pendingCount)}
          sub={<p className="text-xs text-muted-foreground">a realizar</p>}
        />
        <Card className="flex flex-col items-center justify-center gap-2 p-4">
          <p className="text-sm text-muted-foreground">No-Show</p>
          <div className="relative flex h-16 w-16 items-center justify-center">
            <svg className="h-16 w-16 -rotate-90">
              <circle cx="32" cy="32" r="28" strokeWidth="6" className="fill-none stroke-muted" />
              <circle
                cx="32"
                cy="32"
                r="28"
                strokeWidth="6"
                strokeDasharray={2 * Math.PI * 28}
                strokeDashoffset={2 * Math.PI * 28 * (1 - data.kpis.noShowRate / 100)}
                strokeLinecap="round"
                className="fill-none stroke-primary"
              />
            </svg>
            <span className="absolute text-sm font-semibold">
              {data.kpis.noShowRate.toFixed(1)}%
            </span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Próximos</h2>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
          ) : (
            <ul className="space-y-3">
              {data.upcoming.map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                    {initials(a.client.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.client.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.services.map((s) => s.service.name).join(" + ")} · {a.professional.name}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{a.startTime}</p>
                    <p>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(a.scheduledDate)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Painel</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Clientes</p>
              <p className="text-lg font-semibold">
                {data.painel.totalClients}{" "}
                <span className="text-xs font-normal text-success">
                  +{data.painel.newClientsInPeriod} novos
                </span>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Profissionais ativos</p>
              <p className="text-lg font-semibold">{data.painel.activeProfessionals}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Comissões</p>
              <p className="text-lg font-semibold">{formatBRL(data.painel.commissionsInPeriod)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">MRR</p>
              <p className="text-lg font-semibold">{formatBRL(data.painel.mrr)}</p>
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
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Trophy className="h-4 w-4 text-primary" /> Ranking
          </h2>
          {data.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem atendimentos concluídos no período.</p>
          ) : (
            <ul className="space-y-3">
              {data.ranking.map((p, i) => {
                const max = data.ranking[0].revenue || 1;
                return (
                  <li key={p.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        {i < 3 ? (
                          <Medal
                            className={cn(
                              "h-4 w-4",
                              i === 0 && "text-primary",
                              i === 1 && "text-muted-foreground",
                              i === 2 && "text-warning/70",
                            )}
                          />
                        ) : (
                          <span className="w-4 text-center text-xs text-muted-foreground">{i + 1}</span>
                        )}
                        {p.name}
                      </span>
                      <span className="text-muted-foreground">
                        {formatBRL(p.revenue)} <span className="text-xs">{p.count}x</span>
                      </span>
                    </div>
                    <Progress value={(p.revenue / max) * 100} className="h-1.5" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Scissors className="h-4 w-4 text-primary" /> Serviços Populares
          </h2>
          {data.popularServices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <ul className="space-y-3">
              {data.popularServices.map((s) => {
                const max = data.popularServices[0].count || 1;
                return (
                  <li key={s.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">
                        <span className="text-xs">{s.count}x</span> {formatBRL(s.revenue)}
                      </span>
                    </div>
                    <Progress value={(s.count / max) * 100} className="h-1.5" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Atividade Recente</h2>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem atividade registrada ainda.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {data.recentActivity.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{describeActivity(log.action)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
  };
  return map[action] ?? action;
}
