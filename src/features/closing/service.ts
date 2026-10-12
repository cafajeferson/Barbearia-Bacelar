import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { SUBSCRIPTION_PAYMENT_ACTION } from "@/features/subscriptions/service";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode fechar o mês.");
}

function monthRange(periodMonth: Date) {
  const start = new Date(periodMonth.getFullYear(), periodMonth.getMonth(), 1);
  const end = new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 1);
  return { start, end };
}

export type ClosingRow = {
  professionalId: string;
  name: string;
  active: boolean;
  attendances: number;
  /** Atendimentos do mês que ainda não foram fechados (não entram nos valores). */
  openAttendances: number;
  services: number;
  products: number;
  commission: number;
  subscription: number;
  paid: number;
  pending: number;
};

/**
 * "Fechamento do mês": tudo que o dono precisa pra pagar os barbeiros num
 * lugar só — o que entrou (serviços, produtos, assinaturas), quanto cada
 * um tem a receber e o que ainda trava o fechamento (atendimento sem
 * resolução, comissão não paga). Só leitura; os valores de comissão são os
 * mesmos da tela Comissões (CommissionEntry do mês), não um cálculo paralelo.
 */
export async function getMonthClosing(params: { ctx: AuthenticatedContext; periodMonth: Date; unitId?: string }) {
  requireAdmin(params.ctx);
  const { ctx, unitId } = params;
  const { start, end } = monthRange(params.periodMonth);
  const unitFilter = unitId ? { unitId } : {};

  // Três transações em paralelo (cada consulta dentro de uma `tx` roda em
  // série na mesma conexão) — mesmo padrão do dashboard.
  const [a, b, c] = await Promise.all([
    withAppContext(ctx, async (tx) => {
      const appointments = await tx.appointment.findMany({
        where: { ...unitFilter, scheduledDate: { gte: start, lt: end }, status: { not: "CANCELLED" } },
        select: {
          professionalId: true,
          status: true,
          scheduledDate: true,
          totalPrice: true,
          products: { select: { quantity: true, priceAtBooking: true } },
        },
      });
      const productSales = await tx.productSale.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { professionalId: true, quantity: true, unitPrice: true },
      });
      return { appointments, productSales };
    }),
    withAppContext(ctx, async (tx) => {
      const entries = await tx.commissionEntry.findMany({
        where: { periodMonth: start },
        select: { professionalId: true, type: true, calculatedAmount: true, status: true },
      });
      const professionals = await tx.professional.findMany({
        select: { id: true, name: true, active: true },
        orderBy: { name: "asc" },
      });
      return { entries, professionals };
    }),
    withAppContext(ctx, async (tx) => {
      const activeSubs = await tx.clientSubscription.findMany({
        where: { status: "ACTIVE" },
        select: { nextBillingDate: true },
      });
      // Pagamentos de mensalidade registrados no mês (botão "Registrar
      // pagamento" em Assinaturas) — o valor fica no metadata do log.
      const payments = await tx.activityLog.findMany({
        where: { action: SUBSCRIPTION_PAYMENT_ACTION, createdAt: { gte: start, lt: end } },
        select: { metadata: true },
      });
      return { activeSubs, payments };
    }),
  ]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const rows = new Map<string, ClosingRow>();
  for (const p of b.professionals) {
    rows.set(p.id, {
      professionalId: p.id,
      name: p.name,
      active: p.active,
      attendances: 0,
      openAttendances: 0,
      services: 0,
      products: 0,
      commission: 0,
      subscription: 0,
      paid: 0,
      pending: 0,
    });
  }

  let openCount = 0;
  for (const appt of a.appointments) {
    const row = rows.get(appt.professionalId);
    if (!row) continue;
    if (appt.status === "COMPLETED") {
      row.attendances += 1;
      row.services += Number(appt.totalPrice);
      for (const p of appt.products) row.products += p.quantity * Number(p.priceAtBooking);
    } else if (appt.status !== "NO_SHOW" && appt.scheduledDate.toISOString().slice(0, 10) < todayKey) {
      // Dia já passou e ninguém disse se o cliente veio — mesma ideia da tela "Em aberto".
      row.openAttendances += 1;
      openCount += 1;
    }
  }
  for (const sale of a.productSales) {
    if (!sale.professionalId) continue;
    const row = rows.get(sale.professionalId);
    if (row) row.products += sale.quantity * Number(sale.unitPrice);
  }
  for (const e of b.entries) {
    const row = rows.get(e.professionalId);
    if (!row) continue;
    const amount = Number(e.calculatedAmount);
    if (e.type === "SUBSCRIPTION") row.subscription += amount;
    else row.commission += amount;
    if (e.status === "PAID") row.paid += amount;
    else row.pending += amount;
  }

  // Ex-profissional sem nenhum movimento no mês não aparece.
  const list = Array.from(rows.values()).filter(
    (r) => r.active || r.attendances > 0 || r.openAttendances > 0 || r.commission + r.subscription + r.products > 0,
  );

  const sum = (pick: (r: ClosingRow) => number) => list.reduce((s, r) => s + pick(r), 0);
  const subscriptionsRevenue = c.payments.reduce((s, p) => {
    const amount = (p.metadata as { amount?: unknown } | null)?.amount;
    return s + (typeof amount === "number" ? amount : 0);
  }, 0);
  const overdueSubscriptions = c.activeSubs.filter(
    (sub) => sub.nextBillingDate && sub.nextBillingDate.toISOString().slice(0, 10) < todayKey,
  ).length;

  return {
    rows: list,
    totals: {
      attendances: sum((r) => r.attendances),
      services: sum((r) => r.services),
      products: sum((r) => r.products),
      subscriptions: subscriptionsRevenue,
      commission: sum((r) => r.commission),
      subscriptionCommission: sum((r) => r.subscription),
      paid: sum((r) => r.paid),
      pending: sum((r) => r.pending),
    },
    checklist: {
      openAppointments: openCount,
      overdueSubscriptions,
      activeSubscriptions: c.activeSubs.length,
      subscriptionPayments: c.payments.length,
      pendingCommissionProfessionals: list.filter((r) => r.pending > 0).length,
      hasCommissionEntries: b.entries.length > 0,
    },
  };
}

/** Marca como pagas todas as comissões pendentes do mês — de um profissional, ou de todos. */
export async function markMonthCommissionsPaid(params: {
  ctx: AuthenticatedContext;
  periodMonth: Date;
  professionalId?: string;
}) {
  requireAdmin(params.ctx);
  const { start } = monthRange(params.periodMonth);
  return withAppContext(params.ctx, (tx) =>
    tx.commissionEntry.updateMany({
      where: {
        periodMonth: start,
        status: "PENDING",
        ...(params.professionalId ? { professionalId: params.professionalId } : {}),
      },
      data: { status: "PAID", paidAt: new Date() },
    }),
  );
}
