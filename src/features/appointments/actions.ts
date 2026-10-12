"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, type AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { ttlCached } from "@/server/db/ttl-cache";
import * as service from "./service";
import { getAvailableSlots, getUnionAvailableSlots, getMonthAvailabilityLevels } from "./availability";
import { transitionAppointmentStatus } from "./stateMachine";
import { bookAppointmentAsClient, validateCoupon } from "./booking";
import type { AppointmentSource, AppointmentStatus } from "@/generated/prisma/enums";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

/**
 * Primeiro instante que o CLIENTE pode agendar: agora + antecedência mínima
 * das Regras do Sistema — a mesma regra que createAppointment aplica na
 * confirmação, aplicada já na lista de horários. Admin/profissional não têm
 * essa restrição (encaixe e walk-in são livres), então não filtra pra eles.
 */
async function earliestBookableInstant(ctx: AuthenticatedContext): Promise<Date | undefined> {
  if (ctx.role !== "CLIENT") return undefined;
  const minLead = await ttlCached("booking:min-lead-minutes", 60_000, () =>
    withAppContext(ctx, async (tx) => {
      const settings = await tx.systemSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: { bookingMinLeadMinutes: true },
      });
      return settings.bookingMinLeadMinutes;
    }),
  );
  return new Date(Date.now() + minLead * 60_000);
}

export async function createAppointmentAction(input: {
  unitId: string;
  professionalId: string | "ANY";
  candidateProfessionalIds?: string[];
  clientId?: string;
  serviceIds: string[];
  scheduledDate: string; // ISO date
  startTime: string;
  source: AppointmentSource;
  notes?: string;
  forceOverlap?: boolean;
  overrideReason?: string;
}) {
  const ctx = await requireAuth();
  const appointment = await service.createAppointment({
    ctx,
    ...input,
    scheduledDate: new Date(input.scheduledDate),
  });
  revalidatePath("/agenda");
  revalidatePath("/minha-agenda");
  return appointment;
}

export async function rescheduleAppointmentAction(input: {
  appointmentId: string;
  scheduledDate?: string;
  startTime?: string;
  professionalId?: string;
  durationMinutes?: number;
  forceOverlap?: boolean;
  overrideReason?: string;
}) {
  const ctx = await requireAuth();
  const appointment = await service.rescheduleAppointment({
    ctx,
    ...input,
    scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : undefined,
  });
  revalidatePath("/agenda");
  revalidatePath("/minha-agenda");
  return appointment;
}

export async function cancelAppointmentAction(input: {
  appointmentId: string;
  reason?: string;
}) {
  const ctx = await requireAuth();
  const appointment = await service.cancelAppointment({ ctx, ...input });
  revalidatePath("/agenda");
  revalidatePath("/minha-agenda");
  revalidatePath("/horarios");
  return appointment;
}

export async function transitionAppointmentStatusAction(input: {
  appointmentId: string;
  toStatus: AppointmentStatus;
  overrideReason?: string;
}) {
  const ctx = await requireAuth();
  const appointment = await transitionAppointmentStatus({ ctx, ...input });
  revalidatePath("/agenda");
  revalidatePath("/minha-agenda");
  revalidatePath("/em-aberto");
  revalidatePath("/dashboard");
  return appointment;
}

export async function listOpenAppointmentsAction() {
  const ctx = await requireAuth();
  return service.listOpenAppointments({ ctx });
}

export async function listAppointmentsAction(input: {
  professionalId?: string;
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string[];
}) {
  const ctx = await requireAuth();
  return service.listAppointments({
    ctx,
    professionalId: input.professionalId,
    clientId: input.clientId,
    dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
    dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
    status: input.status,
  });
}

export async function getAvailableSlotsAction(input: {
  professionalId: string;
  date: string;
  durationMinutes: number;
}) {
  await requireAuth();
  return getAvailableSlots({
    professionalId: input.professionalId,
    date: new Date(input.date),
    durationMinutes: input.durationMinutes,
  });
}

export async function getUnionAvailableSlotsAction(input: {
  professionalIds: string[];
  date: string;
  durationMinutes: number;
}) {
  const ctx = await requireAuth();
  return getUnionAvailableSlots({
    professionalIds: input.professionalIds,
    date: new Date(input.date),
    durationMinutes: input.durationMinutes,
    earliest: await earliestBookableInstant(ctx),
  });
}

export async function getMonthAvailabilityAction(input: {
  professionalIds: string[];
  year: number;
  month: number;
  durationMinutes: number;
}) {
  const ctx = await requireAuth();
  return getMonthAvailabilityLevels({ ...input, earliest: await earliestBookableInstant(ctx) });
}

/** Valida o cupom assim que o cliente clica "Aplicar" — feedback na hora, em vez de só descobrir que é inválido/expirado ao confirmar o agendamento inteiro. */
export async function validateCouponAction(code: string) {
  const ctx = await requireAuth();
  if (ctx.role !== "CLIENT" || !ctx.userId) throw new Error("Este fluxo é exclusivo para clientes.");
  const coupon = await validateCoupon(ctx, code, ctx.userId);
  return { code: coupon.code, discountType: coupon.discountType, discountValue: Number(coupon.discountValue) };
}

export async function bookAppointmentAsClientAction(input: {
  unitId: string;
  professionalId: string | "ANY";
  candidateProfessionalIds?: string[];
  serviceIds: string[];
  products?: { productId: string; quantity: number }[];
  scheduledDate: string;
  startTime: string;
  couponCode?: string;
  paymentMethod: "LOCAL" | "SUBSCRIPTION";
  subscriptionId?: string;
  recurring?: { intervalDays: number };
}) {
  const ctx = await requireAuth();
  const appointment = await bookAppointmentAsClient({
    ctx,
    ...input,
    scheduledDate: new Date(input.scheduledDate),
  });
  revalidatePath("/horarios");
  revalidatePath("/plano");
  revalidatePath("/agenda");
  revalidatePath("/minha-agenda");
  return appointment;
}
