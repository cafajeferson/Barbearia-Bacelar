import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { createAppointment } from "./service";

/**
 * Fluxo de agendamento do cliente (wizard de 4 passos): cria o agendamento
 * e, se pedido, aplica cupom, consome crédito de assinatura e/ou cria a
 * série recorrente. Não é 100% atômico com a criação do agendamento (cada
 * etapa é sua própria transação) — de propósito: o agendamento em si é o
 * efeito principal e deve sobreviver mesmo se, por exemplo, o cupom informado
 * for inválido; o cliente só vê um erro pontual sobre o cupom, não perde a
 * marcação. Admin sempre pode corrigir manualmente qualquer coisa depois.
 */
export async function bookAppointmentAsClient(params: {
  ctx: AuthenticatedContext;
  unitId: string;
  professionalId: string | "ANY";
  candidateProfessionalIds?: string[];
  serviceIds: string[];
  scheduledDate: Date;
  startTime: string;
  couponCode?: string;
  paymentMethod: "LOCAL" | "SUBSCRIPTION";
  subscriptionId?: string;
  recurring?: { intervalDays: number };
}) {
  const { ctx } = params;
  if (ctx.role !== "CLIENT" || !ctx.userId) {
    throw new Error("Este fluxo é exclusivo para clientes.");
  }
  const clientId = ctx.userId;

  // Validações que devem falhar ANTES de criar o agendamento.
  let coupon: Awaited<ReturnType<typeof findCoupon>> = null;
  if (params.couponCode) {
    coupon = await validateCoupon(ctx, params.couponCode, clientId);
  }

  let subscription: Awaited<ReturnType<typeof findSubscription>> = null;
  if (params.paymentMethod === "SUBSCRIPTION") {
    if (!params.subscriptionId) throw new Error("Selecione a assinatura para pagar com créditos.");
    subscription = await findSubscription(ctx, params.subscriptionId);
    if (!subscription || subscription.clientId !== clientId) {
      throw new Error("Assinatura não encontrada.");
    }
    if (subscription.status !== "ACTIVE") throw new Error("Sua assinatura não está ativa.");
    if (subscription.creditsUsedThisPeriod >= subscription.plan.creditLimitPerMonth) {
      throw new Error("Limite de créditos do mês atingido para esta assinatura.");
    }
  }

  const appointment = await createAppointment({
    ctx,
    unitId: params.unitId,
    professionalId: params.professionalId,
    candidateProfessionalIds: params.candidateProfessionalIds,
    serviceIds: params.serviceIds,
    scheduledDate: params.scheduledDate,
    startTime: params.startTime,
    source: "APP",
  });

  return withAppContext(ctx, async (tx) => {
    let finalAppointment = appointment;

    if (coupon) {
      const discountAmount =
        coupon.discountType === "PERCENT"
          ? (Number(appointment.totalPrice) * Number(coupon.discountValue)) / 100
          : Number(coupon.discountValue);
      const newPrice = Math.max(0, Number(appointment.totalPrice) - discountAmount);

      finalAppointment = await tx.appointment.update({
        where: { id: appointment.id },
        data: { totalPrice: newPrice },
      });
      await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          appointmentId: appointment.id,
          clientId: clientId,
          discountApplied: discountAmount,
        },
      });
      const newUsageCount = coupon.usageCount + 1;
      await tx.coupon.update({
        where: { id: coupon.id },
        data: {
          usageCount: { increment: 1 },
          status: newUsageCount >= coupon.usageLimit ? "USED" : "ACTIVE",
        },
      });
    }

    if (subscription) {
      await tx.subscriptionCreditUsage.create({
        data: { clientSubscriptionId: subscription.id, appointmentId: appointment.id, creditsUsed: 1 },
      });
      await tx.clientSubscription.update({
        where: { id: subscription.id },
        data: { creditsUsedThisPeriod: { increment: 1 } },
      });
      finalAppointment = await tx.appointment.update({
        where: { id: appointment.id },
        data: { totalPrice: 0 },
      });
    }

    if (params.recurring) {
      const nextRunDate = new Date(params.scheduledDate);
      nextRunDate.setDate(nextRunDate.getDate() + params.recurring.intervalDays);
      const series = await tx.recurringSeries.create({
        data: {
          clientId: clientId,
          professionalId: finalAppointment.professionalId,
          unitId: params.unitId,
          intervalDays: params.recurring.intervalDays,
          startTime: params.startTime,
          startDate: params.scheduledDate,
          nextRunDate,
          occurrencesGenerated: 1,
          status: "ACTIVE",
          services: { create: params.serviceIds.map((serviceId) => ({ serviceId })) },
        },
      });
      finalAppointment = await tx.appointment.update({
        where: { id: appointment.id },
        data: { recurringSeriesId: series.id, isRecurring: true },
      });
    }

    return finalAppointment;
  });
}

function findCoupon(ctx: AuthenticatedContext, code: string) {
  return withAppContext(ctx, (tx) => tx.coupon.findUnique({ where: { code: code.toUpperCase() } }));
}

/**
 * Exportada pra também validar o cupom no momento em que o cliente clica
 * "Aplicar" no wizard (feedback na hora) — antes disso, o cupom só era
 * checado no confirmar final, e um cupom expirado/inválido ali derrubava a
 * página inteira em produção (erro não tratado escapando do try/catch do
 * clique de confirmar).
 */
export async function validateCoupon(ctx: AuthenticatedContext, code: string, clientId: string) {
  const coupon = await findCoupon(ctx, code);
  if (!coupon) throw new Error("Cupom inválido.");
  if (coupon.status !== "ACTIVE") throw new Error("Este cupom não está ativo.");
  if (coupon.validUntil.getTime() < Date.now()) throw new Error("Este cupom expirou.");
  if (coupon.usageCount >= coupon.usageLimit) throw new Error("Este cupom já atingiu o limite de usos.");
  if (coupon.clientId && coupon.clientId !== clientId) {
    throw new Error("Este cupom não é válido para este cliente.");
  }
  return coupon;
}

function findSubscription(ctx: AuthenticatedContext, subscriptionId: string) {
  return withAppContext(ctx, (tx) =>
    tx.clientSubscription.findUnique({ where: { id: subscriptionId }, include: { plan: true } }),
  );
}
