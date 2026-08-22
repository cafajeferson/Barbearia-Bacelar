import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar planos e assinaturas.");
}

// ---------- Planos ----------

export async function createSubscriptionPlan(params: {
  ctx: AuthenticatedContext;
  name: string;
  priceMonthly: number;
  creditLimitPerMonth: number;
  billingRule?: string;
  serviceIds: string[];
}) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.subscriptionPlan.create({
      data: {
        name: params.name,
        priceMonthly: params.priceMonthly,
        creditLimitPerMonth: params.creditLimitPerMonth,
        billingRule: params.billingRule,
        services: { create: params.serviceIds.map((serviceId) => ({ serviceId })) },
      },
    }),
  );
}

export async function updateSubscriptionPlan(params: {
  ctx: AuthenticatedContext;
  planId: string;
  name?: string;
  priceMonthly?: number;
  creditLimitPerMonth?: number;
  billingRule?: string;
  active?: boolean;
}) {
  requireAdmin(params.ctx);
  const { ctx, planId, ...data } = params;
  return withAppContext(ctx, (tx) => tx.subscriptionPlan.update({ where: { id: planId }, data }));
}

export async function listSubscriptionPlans(params: { ctx: AuthenticatedContext }) {
  return withAppContext(params.ctx, (tx) =>
    tx.subscriptionPlan.findMany({
      include: { services: { include: { service: true } } },
      orderBy: { priceMonthly: "asc" },
    }),
  );
}

// ---------- Assinaturas de clientes ----------

/** Cliente pede uma assinatura (fica PENDING até admin aprovar). Admin também pode criar direto p/ walk-in. */
export async function requestClientSubscription(params: {
  ctx: AuthenticatedContext;
  clientId: string;
  planId: string;
}) {
  if (params.ctx.role === "CLIENT" && params.ctx.userId !== params.clientId) {
    throw new Error("Você só pode assinar um plano para si mesmo.");
  }
  if (params.ctx.role !== "CLIENT" && params.ctx.role !== "ADMIN") {
    throw new Error("Sem permissão para solicitar assinatura.");
  }
  return withAppContext(params.ctx, (tx) =>
    tx.clientSubscription.create({
      data: { clientId: params.clientId, planId: params.planId, status: "PENDING" },
    }),
  );
}

export async function approveClientSubscription(params: { ctx: AuthenticatedContext; subscriptionId: string }) {
  requireAdmin(params.ctx);
  const nextBillingDate = new Date();
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  return withAppContext(params.ctx, (tx) =>
    tx.clientSubscription.update({
      where: { id: params.subscriptionId },
      data: {
        status: "ACTIVE",
        approvedBy: params.ctx.sessionUserId,
        approvedAt: new Date(),
        startDate: new Date(),
        nextBillingDate,
        creditsUsedThisPeriod: 0,
      },
    }),
  );
}

export async function rejectClientSubscription(params: { ctx: AuthenticatedContext; subscriptionId: string }) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.clientSubscription.update({ where: { id: params.subscriptionId }, data: { status: "CANCELLED" } }),
  );
}

export async function setClientSubscriptionStatus(params: {
  ctx: AuthenticatedContext;
  subscriptionId: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
}) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.clientSubscription.update({ where: { id: params.subscriptionId }, data: { status: params.status } }),
  );
}

/** Cliente cancela a própria assinatura (tela "Plano" do app). */
export async function cancelOwnSubscription(params: { ctx: AuthenticatedContext; subscriptionId: string }) {
  if (params.ctx.role !== "CLIENT") throw new Error("Ação exclusiva do cliente dono da assinatura.");
  return withAppContext(params.ctx, async (tx) => {
    const sub = await tx.clientSubscription.findUniqueOrThrow({ where: { id: params.subscriptionId } });
    if (sub.clientId !== params.ctx.userId) throw new Error("Esta assinatura não é sua.");
    return tx.clientSubscription.update({ where: { id: params.subscriptionId }, data: { status: "CANCELLED" } });
  });
}

/** Registra manualmente 1 crédito usado (ex.: atendimento não passou pelo fluxo normal). */
export async function addManualCreditUsage(params: { ctx: AuthenticatedContext; subscriptionId: string }) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.clientSubscription.update({
      where: { id: params.subscriptionId },
      data: { creditsUsedThisPeriod: { increment: 1 } },
    }),
  );
}

export async function listClientSubscriptions(params: {
  ctx: AuthenticatedContext;
  search?: string;
  status?: "PENDING" | "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED";
}) {
  return withAppContext(params.ctx, (tx) =>
    tx.clientSubscription.findMany({
      where: {
        status: params.status,
        client: params.search
          ? { name: { contains: params.search, mode: "insensitive" } }
          : undefined,
      },
      include: { client: true, plan: { include: { services: { include: { service: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  );
}

/** Assinaturas do próprio cliente logado — tela "Plano" do app. */
export async function getOwnSubscriptions(params: { ctx: AuthenticatedContext }) {
  if (params.ctx.role !== "CLIENT" || !params.ctx.userId) return [];
  return withAppContext(params.ctx, (tx) =>
    tx.clientSubscription.findMany({
      where: { clientId: params.ctx.userId! },
      include: { plan: { include: { services: { include: { service: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function getSubscriptionSummary(params: { ctx: AuthenticatedContext }) {
  return withAppContext(params.ctx, async (tx) => {
    const all = await tx.clientSubscription.findMany({ include: { plan: true } });
    const pending = all.filter((s) => s.status === "PENDING").length;
    const active = all.filter((s) => s.status === "ACTIVE");
    const monthlyRevenue = active.reduce((sum, s) => sum + Number(s.plan.priceMonthly), 0);
    return {
      pending,
      activeCount: active.length,
      activePct: all.length > 0 ? (active.length / all.length) * 100 : 0,
      monthlyRevenue,
    };
  });
}
