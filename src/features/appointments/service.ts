import type {
  AppointmentSource,
} from "@/generated/prisma/enums";
import type { ProfessionalModel } from "@/generated/prisma/models/Professional";
import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { addMinutesToTime, combineDateAndTime } from "@/shared/lib/time";
import { pickAnyAvailableProfessional } from "./availability";
import { translateOverlapError } from "./errors";
import { transitionAppointmentStatus } from "./stateMachine";

function assertForceOverlapAllowed(
  ctx: AuthenticatedContext,
  forceOverlap: boolean | undefined,
  overrideReason: string | undefined,
) {
  if (!forceOverlap) return;
  if (ctx.role !== "ADMIN") {
    throw new Error("Somente ADMIN pode forçar sobreposição de horário.");
  }
  if (!overrideReason?.trim()) {
    throw new Error("Informe o motivo para forçar a sobreposição.");
  }
}

export async function createAppointment(params: {
  ctx: AuthenticatedContext;
  unitId: string;
  professionalId: string | "ANY";
  candidateProfessionalIds?: string[];
  clientId?: string;
  serviceIds: string[];
  /** Produtos que o cliente pede pra separar — não é uma venda (ver AppointmentProduct). */
  products?: { productId: string; quantity: number }[];
  scheduledDate: Date;
  startTime: string;
  source: AppointmentSource;
  notes?: string;
  forceOverlap?: boolean;
  overrideReason?: string;
}) {
  const { ctx } = params;
  assertForceOverlapAllowed(ctx, params.forceOverlap, params.overrideReason);

  // Passos de leitura/resolução ficam FORA da transação de criação, de
  // propósito: pickAnyAvailableProfessional (abaixo) abre suas próprias
  // transações internamente (contexto ADMIN) — aninhar prisma.$transaction
  // dentro de outra prisma.$transaction já causou um bug real de RLS aqui
  // (ver cancelAppointment/CHANGELOG do fix), então cada `withAppContext`
  // roda isolado, nunca dentro do callback de outro.
  const services = await withAppContext(ctx, (tx) =>
    tx.service.findMany({ where: { id: { in: params.serviceIds }, active: true } }),
  );
  if (services.length !== params.serviceIds.length) {
    throw new Error("Um ou mais serviços não existem ou estão inativos.");
  }
  const durationMinutes = services.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalPrice = services.reduce((sum, s) => sum + Number(s.price), 0);
  const endTime = addMinutesToTime(params.startTime, durationMinutes);

  const requestedProducts = params.products?.filter((p) => p.quantity > 0) ?? [];
  const productPriceById = new Map<string, number>();
  if (requestedProducts.length > 0) {
    const products = await withAppContext(ctx, (tx) =>
      tx.product.findMany({ where: { id: { in: requestedProducts.map((p) => p.productId) }, active: true } }),
    );
    if (products.length !== requestedProducts.length) {
      throw new Error("Um ou mais produtos não existem ou estão inativos.");
    }
    for (const p of products) productPriceById.set(p.id, Number(p.price));
  }

  let clientId: string;
  if (ctx.role === "CLIENT") {
    if (!ctx.userId) throw new Error("Sessão de cliente inválida.");
    clientId = ctx.userId;

    const settings = await withAppContext(ctx, (tx) => tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } }));
    const requestedAt = combineDateAndTime(params.scheduledDate, params.startTime);
    const minutesUntil = (requestedAt.getTime() - Date.now()) / 60_000;
    const daysUntil = minutesUntil / (60 * 24);

    if (minutesUntil < settings.bookingMinLeadMinutes) {
      throw new Error(
        `É preciso agendar com pelo menos ${settings.bookingMinLeadMinutes} minutos de antecedência.`,
      );
    }
    if (daysUntil > settings.bookingMaxLeadDays) {
      throw new Error(
        `Não é possível agendar com mais de ${settings.bookingMaxLeadDays} dias de antecedência.`,
      );
    }
  } else {
    if (!params.clientId) throw new Error("clientId é obrigatório.");
    clientId = params.clientId;
  }

  let professionalId = params.professionalId;
  if (professionalId === "ANY") {
    if (!params.candidateProfessionalIds?.length) {
      throw new Error("Informe os profissionais candidatos para 'Qualquer Profissional'.");
    }
    const picked = await pickAnyAvailableProfessional({
      candidateProfessionalIds: params.candidateProfessionalIds,
      date: params.scheduledDate,
      startTime: params.startTime,
      durationMinutes,
    });
    if (!picked) throw new Error("Nenhum profissional disponível nesse horário.");
    professionalId = picked;
  }

  return withAppContext(ctx, async (tx) => {
    try {
      const appointment = await tx.appointment.create({
        data: {
          unitId: params.unitId,
          clientId,
          professionalId,
          status: "SCHEDULED",
          source: params.source,
          scheduledDate: params.scheduledDate,
          startTime: params.startTime,
          endTime,
          totalPrice,
          notes: params.notes,
          forceOverlap: params.forceOverlap ?? false,
          overlapOverrideBy: params.forceOverlap ? ctx.sessionUserId : null,
          overlapOverrideReason: params.forceOverlap ? params.overrideReason : null,
          createdBy: ctx.sessionUserId,
          services: {
            create: services.map((s) => ({
              serviceId: s.id,
              priceAtBooking: s.price,
              durationAtBooking: s.durationMinutes,
            })),
          },
          products: requestedProducts.length
            ? {
                create: requestedProducts.map((p) => ({
                  productId: p.productId,
                  quantity: p.quantity,
                  priceAtBooking: productPriceById.get(p.productId)!,
                })),
              }
            : undefined,
        },
      });

      await tx.activityLog.create({
        data: {
          actorUserId: ctx.sessionUserId,
          action: params.forceOverlap ? "APPOINTMENT_FORCED_OVERLAP" : "APPOINTMENT_CREATED",
          entityType: "Appointment",
          entityId: appointment.id,
          metadata: { source: params.source, reason: params.overrideReason ?? undefined },
        },
      });

      return appointment;
    } catch (err) {
      throw translateOverlapError(err);
    }
  });
}

export async function rescheduleAppointment(params: {
  ctx: AuthenticatedContext;
  appointmentId: string;
  scheduledDate?: Date;
  startTime?: string;
  professionalId?: string;
  /** Override manual da duração (ex.: resize na Agenda Mestre) — por padrão a duração vem da soma dos serviços. */
  durationMinutes?: number;
  forceOverlap?: boolean;
  overrideReason?: string;
}) {
  const { ctx } = params;
  // Reagendamento livre (sem checar janela/antecedência de reserva, e
  // podendo trocar de profissional) é uma ferramenta de staff (Agenda
  // Mestre), não um autoatendimento de cliente — o cliente só tem
  // cancelamento (ver cancelAppointment). RLS client_own permite UPDATE na
  // linha, então sem este check um cliente conseguia chamar essa Server
  // Action direto e reagendar pulando as regras de antecedência mínima que
  // createAppointment aplica pro papel CLIENT.
  if (ctx.role !== "ADMIN" && ctx.role !== "PROFESSIONAL") {
    throw new Error("Reagendamento é feito pela equipe — clientes podem cancelar e criar um novo agendamento.");
  }
  assertForceOverlapAllowed(ctx, params.forceOverlap, params.overrideReason);

  return withAppContext(ctx, async (tx) => {
    const existing = await tx.appointment.findUniqueOrThrow({
      where: { id: params.appointmentId },
      include: { services: true },
    });
    const durationMinutes =
      params.durationMinutes ??
      existing.services.reduce((sum, s) => sum + s.durationAtBooking, 0);
    const newStartTime = params.startTime ?? existing.startTime;
    const newEndTime = addMinutesToTime(newStartTime, durationMinutes);
    const newDate = params.scheduledDate ?? existing.scheduledDate;
    const newProfessionalId = params.professionalId ?? existing.professionalId;

    try {
      const updated = await tx.appointment.update({
        where: { id: params.appointmentId },
        data: {
          scheduledDate: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          professionalId: newProfessionalId,
          forceOverlap: params.forceOverlap ?? false,
          overlapOverrideBy: params.forceOverlap ? ctx.sessionUserId : null,
          overlapOverrideReason: params.forceOverlap ? params.overrideReason : null,
        },
      });

      await tx.activityLog.create({
        data: {
          actorUserId: ctx.sessionUserId,
          action: params.forceOverlap ? "APPOINTMENT_FORCED_OVERLAP" : "APPOINTMENT_RESCHEDULED",
          entityType: "Appointment",
          entityId: params.appointmentId,
          metadata: {
            from: {
              date: existing.scheduledDate,
              startTime: existing.startTime,
              professionalId: existing.professionalId,
            },
            to: { date: newDate, startTime: newStartTime, professionalId: newProfessionalId },
            reason: params.overrideReason ?? undefined,
          },
        },
      });

      return updated;
    } catch (err) {
      throw translateOverlapError(err);
    }
  });
}

export async function cancelAppointment(params: {
  ctx: AuthenticatedContext;
  appointmentId: string;
  reason?: string;
}) {
  // Consulta própria (não aninhada dentro de outro withAppContext — chamar
  // prisma.$transaction de dentro de outro $transaction dá cada um sua
  // própria conexão/sessão, e o SET LOCAL de uma pode não valer pra outra,
  // o que já causou um falso-negativo de RLS aqui). transitionAppointmentStatus
  // abre a sua própria transação logo em seguida, como chamada irmã.
  const { feeApplies } = await withAppContext(params.ctx, async (tx) => {
    const appointment = await tx.appointment.findUniqueOrThrow({
      where: { id: params.appointmentId },
    });
    const settings = await tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } });
    const scheduledAt = combineDateAndTime(appointment.scheduledDate, appointment.startTime);
    const hoursUntil = (scheduledAt.getTime() - Date.now()) / 3_600_000;
    return { feeApplies: hoursUntil < settings.cancellationWindowHours };
  });

  return transitionAppointmentStatus({
    ctx: params.ctx,
    appointmentId: params.appointmentId,
    toStatus: "CANCELLED",
    overrideReason: params.reason,
    extraData: { cancellationFeeApplied: feeApplies },
  });
}

/** Dados da Agenda Mestre: profissionais + agendamentos + bloqueios do dia. */
export async function getAgendaMestreData(params: {
  ctx: AuthenticatedContext;
  date: Date;
  unitId?: string;
  /** Já buscada pela página (mesma transação da unidade) — evita abrir mais uma transação só pra isso. */
  professionals?: ProfessionalModel[];
}) {
  return withAppContext(params.ctx, async (tx) => {
    const professionals =
      params.professionals ??
      (await tx.professional.findMany({
        where: { active: true, units: params.unitId ? { some: { unitId: params.unitId } } : undefined },
        orderBy: { name: "asc" },
      }));
    const appointmentsList = await tx.appointment.findMany({
      where: { scheduledDate: params.date, status: { not: "CANCELLED" }, unitId: params.unitId },
      include: {
        // subscriptions ACTIVE só pra decidir o ícone de assinante (coroa)
        // no card — mesmo critério já usado em /clientes.
        client: { include: { subscriptions: { where: { status: "ACTIVE" }, take: 1 } } },
        services: { include: { service: true } },
        products: { include: { product: true } },
        // pra mostrar o selo de cupom (com a porcentagem) direto no card,
        // sem precisar abrir o agendamento — mesmo critério da coroa acima.
        couponRedemptions: { include: { coupon: true } },
      },
    });
    const blockedSlots = await tx.blockedSlot.findMany({ where: { date: params.date } });
    return { professionals, appointments: appointmentsList, blockedSlots };
  });
}

/** Contagem de agendamentos/concluídos por dia — visão "Mês" da Agenda Mestre. */
export async function getAgendaMonthSummary(params: {
  ctx: AuthenticatedContext;
  monthStart: Date;
  monthEnd: Date;
  unitId?: string;
}) {
  return withAppContext(params.ctx, async (tx) => {
    const rows = await tx.appointment.findMany({
      where: {
        scheduledDate: { gte: params.monthStart, lte: params.monthEnd },
        status: { not: "CANCELLED" },
        unitId: params.unitId,
      },
      select: { scheduledDate: true, status: true },
    });
    const byDay = new Map<string, { total: number; completed: number }>();
    for (const r of rows) {
      const key = r.scheduledDate.toISOString().slice(0, 10);
      const entry = byDay.get(key) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (r.status === "COMPLETED") entry.completed += 1;
      byDay.set(key, entry);
    }
    return byDay;
  });
}

export async function listAppointments(params: {
  ctx: AuthenticatedContext;
  professionalId?: string;
  clientId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string[];
}) {
  return withAppContext(params.ctx, (tx) =>
    tx.appointment.findMany({
      where: {
        professionalId: params.professionalId,
        clientId: params.clientId,
        scheduledDate:
          params.dateFrom || params.dateTo
            ? { gte: params.dateFrom, lte: params.dateTo }
            : undefined,
        status: params.status ? { in: params.status as never[] } : undefined,
      },
      include: {
        services: { include: { service: true } },
        products: { include: { product: true } },
        client: true,
        professional: true,
      },
      orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    }),
  );
}

/**
 * Atendimentos "presos" — SCHEDULED/CONFIRMED/IN_PROGRESS cujo horário já
 * passou há mais de 24h sem ninguém ter fechado o status (concluído,
 * cancelado ou marcado como não compareceu). Mesmo critério do card
 * "Atendimentos em aberto" do dashboard (getDashboardData) — centralizado
 * aqui pra não divergir.
 */
export async function listOpenAppointments(params: { ctx: AuthenticatedContext }) {
  return withAppContext(params.ctx, async (tx) => {
    const rows = await tx.appointment.findMany({
      where: { status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] } },
      include: {
        client: true,
        professional: true,
        services: { include: { service: true } },
      },
      orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    });
    const now = new Date();
    return rows
      .map((a) => ({ ...a, scheduledAt: combineDateAndTime(a.scheduledDate, a.startTime) }))
      .filter((a) => now.getTime() - a.scheduledAt.getTime() > 24 * 3_600_000);
  });
}
