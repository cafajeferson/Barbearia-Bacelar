import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar a equipe.");
}

function requireAdminOrSelf(ctx: AuthenticatedContext, professionalId: string) {
  if (ctx.role === "ADMIN") return;
  if (ctx.role === "PROFESSIONAL" && ctx.userId === professionalId) return;
  throw new Error("Sem permissão para essa ação.");
}

export async function createProfessional(params: {
  ctx: AuthenticatedContext;
  name: string;
  email: string;
  phone?: string;
  password: string;
  color?: string;
  title?: string;
  unitIds: string[];
  commissionServicePct?: number;
  commissionWalkInPct?: number;
  commissionProductPct?: number;
}) {
  requireAdmin(params.ctx);

  // Quem valida a senha de agora em diante é o Supabase Auth — a linha em
  // "User" só guarda o vínculo (authUserId) e o papel/perfil de negócio.
  // Se a criação do User no Prisma falhar depois, fica um usuário órfão no
  // Supabase Auth; aceitável aqui (fluxo raro, admin-only, corrigível a
  // mão) — não vale a complexidade de uma transação distribuída de verdade.
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    app_metadata: { role: "PROFESSIONAL" },
  });
  if (authError || !authUser.user) {
    throw new Error(`Não foi possível criar o acesso do profissional: ${authError?.message ?? "erro desconhecido"}`);
  }

  return withAppContext(params.ctx, async (tx) => {
    const user = await tx.user.create({
      data: {
        email: params.email,
        phone: params.phone,
        authUserId: authUser.user.id,
        role: "PROFESSIONAL",
      },
    });

    const professional = await tx.professional.create({
      data: {
        userId: user.id,
        name: params.name,
        color: params.color ?? "#F5B301",
        title: params.title,
        commissionServicePct: params.commissionServicePct,
        commissionWalkInPct: params.commissionWalkInPct,
        commissionProductPct: params.commissionProductPct,
        units: { create: params.unitIds.map((unitId) => ({ unitId })) },
      },
    });

    return professional;
  });
}

export async function updateProfessional(params: {
  ctx: AuthenticatedContext;
  professionalId: string;
  name?: string;
  color?: string;
  title?: string;
  active?: boolean;
  commissionServicePct?: number | null;
  commissionWalkInPct?: number | null;
  commissionProductPct?: number | null;
}) {
  requireAdmin(params.ctx);
  const { ctx, professionalId, ...data } = params;
  return withAppContext(ctx, (tx) =>
    tx.professional.update({ where: { id: professionalId }, data }),
  );
}

/** Desativa o profissional e bumpa tokenVersion do User ligado — desloga na hora. */
export async function deactivateProfessional(params: {
  ctx: AuthenticatedContext;
  professionalId: string;
}) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, async (tx) => {
    const professional = await tx.professional.update({
      where: { id: params.professionalId },
      data: { active: false },
    });
    await tx.user.update({
      where: { id: professional.userId },
      data: { active: false, tokenVersion: { increment: 1 } },
    });
    return professional;
  });
}

export async function setWeeklyAvailability(params: {
  ctx: AuthenticatedContext;
  professionalId: string;
  weekday: number;
  active: boolean;
  startTime?: string;
  endTime?: string;
}) {
  requireAdminOrSelf(params.ctx, params.professionalId);
  return withAppContext(params.ctx, (tx) =>
    tx.weeklyAvailability.upsert({
      where: {
        professionalId_weekday_startTime: {
          professionalId: params.professionalId,
          weekday: params.weekday,
          startTime: params.startTime ?? "09:00",
        },
      },
      update: { active: params.active, endTime: params.endTime },
      create: {
        professionalId: params.professionalId,
        weekday: params.weekday,
        active: params.active,
        startTime: params.startTime ?? "09:00",
        endTime: params.endTime ?? "19:00",
      },
    }),
  );
}

export async function createBlockedSlot(params: {
  ctx: AuthenticatedContext;
  professionalId: string;
  date: Date;
  startTime: string;
  endTime: string;
  reason?: string;
}) {
  requireAdminOrSelf(params.ctx, params.professionalId);
  return withAppContext(params.ctx, (tx) =>
    tx.blockedSlot.create({
      data: {
        professionalId: params.professionalId,
        date: params.date,
        startTime: params.startTime,
        endTime: params.endTime,
        reason: params.reason,
        createdBy: params.ctx.sessionUserId,
      },
    }),
  );
}

export async function deleteBlockedSlot(params: {
  ctx: AuthenticatedContext;
  blockedSlotId: string;
}) {
  return withAppContext(params.ctx, async (tx) => {
    const slot = await tx.blockedSlot.findUniqueOrThrow({ where: { id: params.blockedSlotId } });
    requireAdminOrSelf(params.ctx, slot.professionalId);
    return tx.blockedSlot.delete({ where: { id: params.blockedSlotId } });
  });
}

export async function listProfessionals(params: { ctx: AuthenticatedContext; search?: string }) {
  return withAppContext(params.ctx, (tx) =>
    tx.professional.findMany({
      where: params.search
        ? { name: { contains: params.search, mode: "insensitive" } }
        : undefined,
      include: {
        user: { select: { email: true, phone: true, role: true, active: true } },
        units: { include: { unit: true } },
        weeklyAvailability: true,
      },
      orderBy: { name: "asc" },
    }),
  );
}

/** Dados de "Minha Agenda" — o profissional só vê os próprios atendimentos e números do dia. */
export async function getOwnDayData(params: { ctx: AuthenticatedContext; date: Date }) {
  if (params.ctx.role !== "PROFESSIONAL" || !params.ctx.userId) {
    throw new Error("Disponível apenas para profissionais.");
  }
  const professionalId = params.ctx.userId;

  return withAppContext(params.ctx, async (tx) => {
    const appointments = await tx.appointment.findMany({
      where: { professionalId, scheduledDate: params.date, status: { not: "CANCELLED" } },
      include: { client: true, services: { include: { service: true } } },
      orderBy: { startTime: "asc" },
    });
    const blockedSlots = await tx.blockedSlot.findMany({
      where: { professionalId, date: params.date },
      orderBy: { startTime: "asc" },
    });

    const waiting = appointments.filter((a) => ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(a.status));
    const completed = appointments.filter((a) => a.status === "COMPLETED");
    const revenue = completed.reduce((sum, a) => sum + Number(a.totalPrice), 0);
    const pending = waiting.reduce((sum, a) => sum + Number(a.totalPrice), 0);

    return {
      appointments,
      blockedSlots,
      kpis: {
        waitingCount: waiting.length,
        completedCount: completed.length,
        revenue,
        pending,
      },
    };
  });
}

/** Resumo da semana (7 dias a partir da data) — usado no toggle "Semana" de Minha Agenda. */
export async function getOwnWeekData(params: { ctx: AuthenticatedContext; startDate: Date }) {
  if (params.ctx.role !== "PROFESSIONAL" || !params.ctx.userId) {
    throw new Error("Disponível apenas para profissionais.");
  }
  const professionalId = params.ctx.userId;
  const endDate = new Date(params.startDate);
  endDate.setDate(endDate.getDate() + 6);

  return withAppContext(params.ctx, (tx) =>
    tx.appointment.findMany({
      where: {
        professionalId,
        scheduledDate: { gte: params.startDate, lte: endDate },
        status: { not: "CANCELLED" },
      },
      include: { client: true, services: { include: { service: true } } },
      orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    }),
  );
}

/** Lista pública (para o wizard de agendamento do cliente) — a policy client_read do RLS já restringe a active=true. */
export async function listActiveProfessionalsForBooking(params: { ctx: AuthenticatedContext }) {
  return withAppContext(params.ctx, (tx) =>
    tx.professional.findMany({
      where: { active: true },
      select: { id: true, name: true, color: true, title: true },
      orderBy: { name: "asc" },
    }),
  );
}
