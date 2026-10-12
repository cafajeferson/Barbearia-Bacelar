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

type CommissionSettings = {
  defaultCommissionServicePct: unknown;
  defaultCommissionWalkInPct: unknown;
};
type AppointmentForCommission = {
  source: string;
  totalPrice: unknown;
  professional: { commissionServicePct: unknown; commissionWalkInPct: unknown };
  services: { priceAtBooking: unknown; service: { commissionServicePct: unknown; commissionWalkInPct: unknown } }[];
};

/** Comissão de UM atendimento concluído — a mesma conta na apuração do mês e na hora em que o atendimento é concluído. */
function computeServiceCommission(a: AppointmentForCommission, settings: CommissionSettings) {
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
  return {
    type: (isWalkIn ? "WALK_IN" : "SERVICE") as CommissionType,
    pct,
    base,
    amount,
    formula: `${formatBRL(base)} × ${pct}%`,
  };
}

/**
 * Comissão de assinatura do mês: metade da soma das mensalidades das
 * assinaturas ativas vira um "bolo", dividido igualmente entre os
 * atendimentos CONCLUÍDOS no mês que foram pagos com o plano; cada barbeiro
 * recebe a parte dos atendimentos que fez. É uma linha por barbeiro por mês
 * (não por atendimento), e o valor muda ao longo do mês conforme entram
 * mais atendimentos — o definitivo é o da apuração/fechamento.
 *
 * `paidFor` diz se a linha daquele barbeiro já estava paga (o recálculo
 * recria a linha mantendo o "pago").
 */
async function writeSubscriptionCommissions(
  tx: Parameters<Parameters<typeof withAppContext>[1]>[0],
  start: Date,
  end: Date,
  paidFor: (professionalId: string) => { paidAt: Date | null } | null,
) {
  const creditUsages = await tx.subscriptionCreditUsage.findMany({
    where: { appointment: { status: "COMPLETED", scheduledDate: { gte: start, lt: end } } },
    include: { appointment: true },
  });
  const activeSubs = await tx.clientSubscription.findMany({
    where: { status: "ACTIVE" },
    include: { plan: true },
  });
  const totalSubscriptionRevenue = activeSubs.reduce((sum, s) => sum + Number(s.plan.priceMonthly), 0);
  const totalAttendances = creditUsages.length;
  if (totalAttendances === 0 || totalSubscriptionRevenue <= 0) return totalAttendances;

  const perAttendance = totalSubscriptionRevenue / 2 / totalAttendances;
  const byProfessional = new Map<string, number>();
  for (const cu of creditUsages) {
    const profId = cu.appointment.professionalId;
    byProfessional.set(profId, (byProfessional.get(profId) ?? 0) + 1);
  }

  for (const professionalId of Array.from(byProfessional.keys())) {
    const count = byProfessional.get(professionalId) ?? 0;
    const paid = paidFor(professionalId);
    await tx.commissionEntry.create({
      data: {
        professionalId,
        type: "SUBSCRIPTION",
        periodMonth: start,
        baseAmount: totalSubscriptionRevenue,
        pct: 0,
        calculatedAmount: perAttendance * count,
        calculationFormula: `(${formatBRL(totalSubscriptionRevenue)} / 2) / ${totalAttendances} atend. × ${count} atend.`,
        ...(paid ? { status: "PAID" as const, paidAt: paid.paidAt } : {}),
      },
    });
  }
  return totalAttendances;
}

/**
 * Mantém a comissão de UM atendimento em dia, na hora: concluiu -> a linha
 * aparece em Comissões e no Fechamento sem ninguém precisar clicar em
 * "Recalcular"; deixou de estar concluído (excluído/cancelado) -> a linha
 * pendente some. Linha já paga nunca é mexida aqui.
 *
 * Roda como sistema (ADMIN) porque o profissional que conclui o próprio
 * atendimento não tem permissão de escrita em CommissionEntry. Comissão de
 * assinatura não entra aqui: é um rateio do mês inteiro, feito na apuração.
 */
export async function syncAppointmentCommission(appointmentId: string) {
  const SYSTEM = { role: "ADMIN" as const, userId: null };
  return withAppContext(SYSTEM, async (tx) => {
    const a = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: { professional: true, services: { include: { service: true } } },
    });
    if (!a) return;
    const existing = await tx.commissionEntry.findMany({
      where: { appointmentId, type: { in: ["SERVICE", "WALK_IN"] } },
    });
    // Mês do atendimento (coluna "somente data": componentes em UTC).
    const periodMonth = new Date(a.scheduledDate.getUTCFullYear(), a.scheduledDate.getUTCMonth(), 1);
    const nextMonth = new Date(a.scheduledDate.getUTCFullYear(), a.scheduledDate.getUTCMonth() + 1, 1);

    if (!existing.some((e) => e.status === "PAID")) {
      if (existing.length > 0) {
        await tx.commissionEntry.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } });
      }
      if (a.status === "COMPLETED") {
        const settings = await tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } });
        const c = computeServiceCommission(a, settings);
        // Total R$ 0 (pago com o plano): sem linha de serviço zerada.
        if (c.amount > 0) {
          await tx.commissionEntry.create({
            data: {
              professionalId: a.professionalId,
              type: c.type,
              appointmentId: a.id,
              periodMonth,
              baseAmount: c.base,
              pct: c.pct,
              calculatedAmount: c.amount,
              calculationFormula: c.formula,
            },
          });
        }
      }
    }

    // Atendimento pago com o plano: o rateio de assinatura do mês muda
    // (entrou ou saiu um atendimento do bolo) — refaz as linhas ainda
    // pendentes. Quem já recebeu a de assinatura deste mês fica como está.
    const usedPlan = await tx.subscriptionCreditUsage.count({ where: { appointmentId } });
    if (usedPlan > 0) {
      const paidSubs = new Set(
        (
          await tx.commissionEntry.findMany({
            where: { periodMonth, type: "SUBSCRIPTION", status: "PAID" },
            select: { professionalId: true },
          })
        ).map((e) => e.professionalId),
      );
      await tx.commissionEntry.deleteMany({ where: { periodMonth, type: "SUBSCRIPTION", status: "PENDING" } });
      // Para quem já foi pago, cria-se a linha recalculada como paga e
      // apaga-se a antiga — assim nunca ficam duas linhas do mesmo barbeiro.
      const stale = await tx.commissionEntry.findMany({
        where: { periodMonth, type: "SUBSCRIPTION", status: "PAID" },
        select: { id: true, professionalId: true, paidAt: true },
      });
      const paidAtBy = new Map(stale.map((e) => [e.professionalId, e.paidAt]));
      await tx.commissionEntry.deleteMany({ where: { id: { in: stale.map((e) => e.id) } } });
      await writeSubscriptionCommissions(tx, periodMonth, nextMonth, (professionalId) =>
        paidSubs.has(professionalId) ? { paidAt: paidAtBy.get(professionalId) ?? null } : null,
      );
    }
  });
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
    // Guarda o que já estava pago antes de apagar: o recálculo recria as
    // linhas do zero e, sem isso, tudo voltava a "pendente".
    const paidBefore = await tx.commissionEntry.findMany({
      where: { periodMonth: start, status: "PAID" },
      select: { professionalId: true, type: true, appointmentId: true, paidAt: true },
    });
    const alreadyPaid = new Map(
      paidBefore.map((e) => [`${e.professionalId}|${e.type}|${e.appointmentId ?? ""}`, e.paidAt]),
    );
    await tx.commissionEntry.deleteMany({ where: { periodMonth: start } });
    const settings = await tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } });

    // --- Comissão de serviços: uma linha por atendimento concluído ---
    const appointments = await tx.appointment.findMany({
      where: { status: "COMPLETED", scheduledDate: { gte: start, lt: end } },
      include: { professional: true, services: { include: { service: true } } },
    });
    for (const a of appointments) {
      const c = computeServiceCommission(a, settings);
      // Atendimento pago com o plano tem total R$ 0 — a comissão dele é a
      // de assinatura (rateio abaixo), não uma linha de serviço zerada.
      if (c.amount === 0) continue;
      const key = `${a.professionalId}|${c.type}|${a.id}`;
      const paidAt = alreadyPaid.get(key);
      await tx.commissionEntry.create({
        data: {
          professionalId: a.professionalId,
          type: c.type,
          appointmentId: a.id,
          periodMonth: start,
          baseAmount: c.base,
          pct: c.pct,
          calculatedAmount: c.amount,
          calculationFormula: c.formula,
          // Recalcular não desfaz o que já foi pago ao barbeiro.
          ...(paidAt !== undefined ? { status: "PAID" as const, paidAt } : {}),
        },
      });
    }

    // --- Comissão de assinaturas: pool dividido pelos atendimentos cobertos ---
    const totalAttendances = await writeSubscriptionCommissions(tx, start, end, (professionalId) => {
      const key = `${professionalId}|SUBSCRIPTION|`;
      return alreadyPaid.has(key) ? { paidAt: alreadyPaid.get(key) ?? null } : null;
    });

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
