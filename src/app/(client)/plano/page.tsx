import { getAuthContext } from "@/server/auth/getAuthContext";
import { getOwnSubscriptions, listSubscriptionPlans } from "@/features/subscriptions/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SubscribePlanButton } from "@/features/client-app/components/subscribe-plan-button";
import { CancelSubscriptionButton } from "@/features/client-app/components/cancel-subscription-button";
import { formatBRL } from "@/shared/lib/format";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente de aprovação",
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

export default async function PlanoPage() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.userId) return null;

  const [subscriptions, plans] = await Promise.all([
    getOwnSubscriptions({ ctx }),
    listSubscriptionPlans({ ctx }),
  ]);

  const activeOrPending = subscriptions.filter((s) => s.status === "ACTIVE" || s.status === "PENDING");
  const subscribedPlanIds = new Set(activeOrPending.map((s) => s.planId));

  return (
    <main className="space-y-6 p-4">
      <h1 className="text-lg font-semibold">Meu plano</h1>

      {activeOrPending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Suas assinaturas</h2>
          {activeOrPending.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{s.plan.name}</p>
                <Badge variant={s.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABEL[s.status]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {s.plan.services.map((ps) => ps.service.name).join(" + ")}
              </p>
              {s.status === "ACTIVE" && (
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Créditos usados este mês</span>
                    <span>
                      {s.creditsUsedThisPeriod}/{s.plan.creditLimitPerMonth}
                    </span>
                  </div>
                  <Progress value={(s.creditsUsedThisPeriod / s.plan.creditLimitPerMonth) * 100} className="h-1.5" />
                  {s.nextBillingDate && (
                    <p className="text-xs text-muted-foreground">
                      Próxima cobrança: {new Intl.DateTimeFormat("pt-BR").format(s.nextBillingDate)}
                    </p>
                  )}
                </div>
              )}
              {s.status === "ACTIVE" && (
                <div className="mt-3">
                  <CancelSubscriptionButton subscriptionId={s.id} />
                </div>
              )}
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Planos disponíveis</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plans
            .filter((p) => p.active && !subscribedPlanIds.has(p.id))
            .map((p) => (
              <Card key={p.id} className="flex flex-col gap-2 p-4">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.services.map((ps) => ps.service.name).join(" + ")}
                </p>
                <p className="text-lg font-semibold text-primary">
                  {formatBRL(Number(p.priceMonthly))}
                  <span className="text-xs font-normal text-muted-foreground">/mês</span>
                </p>
                <p className="text-xs text-muted-foreground">{p.creditLimitPerMonth} créditos por mês</p>
                <SubscribePlanButton clientId={ctx.userId!} planId={p.id} />
              </Card>
            ))}
        </div>
      </section>
    </main>
  );
}
