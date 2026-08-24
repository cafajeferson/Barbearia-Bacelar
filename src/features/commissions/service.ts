import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { formatBRL } from "@/shared/lib/format";
import type { CommissionType } from "@/generated/prisma/enums";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar comissões.");
}

function monthRange(periodMonth: Date) {
  const start = new Date(periodMonth.getFullYear(), periodMonth.getMonth(), 1);
  const end = new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 1);
  return { start, end };
}

/**
 * Apuração no 1º do mês seguinte: recalcula do zero (apaga e recria) as
 * comissões de Serviços e Assinaturas do mês informado. Idempotente por
 * design — "Recalcular" pode ser clicado quantas vezes for preciso.
 */
export async function recalculateCommissions(params: { ctx: AuthenticatedContext; periodMonth: Date }) {
  requireAdmin(params.ctx);
  const { start, end } = monthRange(params.periodMonth);

  return withAppContext(params.ctx, async (tx) => {
    await tx.commissionEntry.deleteMany({ where: { periodMonth: start } });
    const settings = await tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } });

    // --- Comissão de serviços: uma linha por atendimento concluído ---
    const appointments = await tx.appointment.findMany({
      where: { status: "COMPLETED", scheduledDate: { gte: start, lt: end } },
      include: { professional: true, services: { include: { service: true } } },
    });
    for (const a of appointments) {
      const isWalkIn = a.source === "WALK_IN";
      const professionalPct = isWalkIn ? a.professional.commissionWalkInPct : a.professional.commissionServicePct;
      const defaultPct = isWalkIn ? settings.defaultCommissionWalkInPct : settings.defaultCommissionServicePct;
      const fallbackPct = Number(professionalPct ?? defaultPct);

      // Serviço pode sobrescrever o % — se o agendamento tem mais de um
      // serviço com % diferentes entre si, pondera pelo preço de cada um
      // (agendamento normal com 1 serviço, o caso de longe mais comum,
      // isso vira só o % daquele serviço).
      let weightedPct = 0;
      let totalWeight = 0;
      for (const as of a.services) {
        const svcPct = isWalkIn ? as.service.commissionWalkInPct : as.service.commissionServicePct;
        const effectivePct = Number(svcPct ?? fallbackPct);
        const weight = Number(as.priceAtBooking);
        weightedPct += effectivePct * weight;
        totalWeight += weight;
      }
      const pct = totalWeight > 0 ? weightedPct / totalWeight : fallbackPct;
      const base = Number(a.totalPrice);
      const amount = (base * pct) / 100;
      await tx.commissionEntry.create({
        data: {
          professionalId: a.professionalId,
          type: a.source === "WALK_IN" ? "WALK_IN" : "SERVICE",
          appointmentId: a.id,
          periodMonth: start,
          baseAmount: base,
          pct,
          calculatedAmount: amount,
          calculationFormula: `${formatBRL(base)} × ${pct}%`,
        },
      });
    }

    // --- Comissão de assinaturas: pool dividido pelos atendimentos cobertos ---
    const creditUsages = await tx.subscriptionCreditUsage.findMany({
      where: { appointment: { scheduledDate: { gte: start, lt: end } } },
      include: { appointment: true },
    });
    const activeSubs = await tx.clientSubscription.findMany({
      where: { status: "ACTIVE" },
      include: { plan: true },
    });
    const totalSubscriptionRevenue = activeSubs.reduce((sum, s) => sum + Number(s.plan.priceMonthly), 0);
    const totalAttendances = creditUsages.length;

    if (totalAttendances > 0 && totalSubscriptionRevenue > 0) {
      const pool = totalSubscriptionRevenue / 2;
      const perAttendance = pool / totalAttendances;

      const byProfessional = new Map<string, number>();
      for (const cu of creditUsages) {
        const profId = cu.appointment.professionalId;
        byProfessional.set(profId, (byProfessional.get(profId) ?? 0) + 1);
      }

      for (const professionalId of Array.from(byProfessional.keys())) {
        const count = byProfessional.get(professionalId) ?? 0;
        const amount = perAttendance * count;
        await tx.commissionEntry.create({
          data: {
            professionalId,
            type: "SUBSCRIPTION",
            periodMonth: start,
            baseAmount: totalSubscriptionRevenue,
            pct: 0,
            calculatedAmount: amount,
            calculationFormula: `(${formatBRL(totalSubscriptionRevenue)} / 2) / ${totalAttendances} atend. × ${count} atend.`,
          },
        });
      }
    }

    return { appointmentsProcessed: appointments.length, subscriptionAttendances: totalAttendances };
  });
}

export async function listServiceCommissions(params: { ctx: AuthenticatedContext; periodMonth: Date }) {
  const { start } = monthRange(params.periodMonth);
  return withAppContext(params.ctx, async (tx) => {
    const entries = await tx.commissionEntry.findMany({
      where: { periodMonth: start, type: { in: ["SERVICE", "WALK_IN"] } },
      include: { professional: true },
      orderBy: { createdAt: "asc" },
    });
    return groupByProfessional(entries);
  });
}

export async function listSubscriptionCommissions(params: { ctx: AuthenticatedContext; periodMonth: Date }) {
  const { start } = monthRange(params.periodMonth);
  return withAppContext(params.ctx, async (tx) => {
    const entries = await tx.commissionEntry.findMany({
      where: { periodMonth: start, type: "SUBSCRIPTION" },
      include: { professional: true },
      orderBy: { createdAt: "asc" },
    });
    return groupByProfessional(entries);
  });
}

function groupByProfessional<
  T extends { professionalId: string; professional: { name: string }; calculatedAmount: unknown; status: string },
>(entries: T[]) {
  const map = new Map<
    string,
    { professionalId: string; name: string; pending: number; paid: number; entries: T[] }
  >();
  for (const e of entries) {
    const g = map.get(e.professionalId) ?? {
      professionalId: e.professionalId,
      name: e.professional.name,
      pending: 0,
      paid: 0,
      entries: [],
    };
    const amount = Number(e.calculatedAmount);
    if (e.status === "PAID") g.paid += amount;
    else g.pending += amount;
    g.entries.push(e);
    map.set(e.professionalId, g);
  }
  return Array.from(map.values()).sort((a, b) => b.pending + b.paid - (a.pending + a.paid));
}

export async function markCommissionsPaid(params: {
  ctx: AuthenticatedContext;
  professionalId: string;
  periodMonth: Date;
  type: "SERVICE" | "SUBSCRIPTION";
}) {
  requireAdmin(params.ctx);
  const { start } = monthRange(params.periodMonth);
  const types: CommissionType[] = params.type === "SERVICE" ? ["SERVICE", "WALK_IN"] : ["SUBSCRIPTION"];
  return withAppContext(params.ctx, (tx) =>
    tx.commissionEntry.updateMany({
      where: { professionalId: params.professionalId, periodMonth: start, type: { in: types }, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date() },
    }),
  );
}

/** "Configurar Comissões" — todo serviço ativo, agrupado por seção, com o % (se sobrescrito) e o default do sistema como fallback pra exibição. */
export async function listServicesForCommissionConfig(params: { ctx: AuthenticatedContext }) {
  return withAppContext(params.ctx, async (tx) => {
    const [sections, settings] = await Promise.all([
      tx.serviceSection.findMany({
        where: { services: { some: { active: true } } },
        include: { services: { where: { active: true }, orderBy: { name: "asc" } } },
        orderBy: { order: "asc" },
      }),
      tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } }),
    ]);
    return {
      sections,
      defaultCommissionServicePct: Number(settings.defaultCommissionServicePct),
      defaultCommissionWalkInPct: Number(settings.defaultCommissionWalkInPct),
    };
  });
}

export async function updateServiceCommission(params: {
  ctx: AuthenticatedContext;
  serviceId: string;
  commissionServicePct: number | null;
  commissionWalkInPct: number | null;
}) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.service.update({
      where: { id: params.serviceId },
      data: {
        commissionServicePct: params.commissionServicePct,
        commissionWalkInPct: params.commissionWalkInPct,
      },
    }),
  );
}
