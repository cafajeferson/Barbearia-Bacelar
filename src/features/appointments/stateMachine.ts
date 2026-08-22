import type { AppointmentStatus } from "@/generated/prisma/enums";
import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

/**
 * Grafo de transições legais (fluxo normal, sem override). Fora daqui,
 * só ADMIN consegue mudar o status — e precisa de um motivo, que fica
 * gravado em AppointmentStatusLog.isOverride para sempre ser auditável.
 * Ver seção "State machine" do plano — este é o único lugar do sistema
 * que muda status de agendamento.
 */
const LEGAL_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: AppointmentStatus, to: AppointmentStatus) {
    super(
      `Transição de ${from} para ${to} não é permitida no fluxo normal. Só ADMIN pode forçar, informando um motivo.`,
    );
    this.name = "IllegalTransitionError";
  }
}

/**
 * O grafo acima só diz quais transições existem no fluxo normal — não quem
 * pode disparar cada uma. RLS garante que CLIENT só alcança o próprio
 * agendamento, mas "é o dono" não é o mesmo que "pode fazer isso": sem este
 * segundo filtro, um cliente conseguia chamar transitionAppointmentStatusAction
 * direto (Server Action é um endpoint alcançável mesmo sem botão na UI) e se
 * auto-marcar COMPLETED — inflando comissão do profissional — ou se
 * auto-completar antes da varredura de no-show rodar, escapando da
 * penalidade por não aparecer.
 */
const CLIENT_ALLOWED_TRANSITIONS: AppointmentStatus[] = ["CANCELLED"];

function assertRoleCanTransition(ctx: AuthenticatedContext, toStatus: AppointmentStatus) {
  if (ctx.role === "CLIENT" && !CLIENT_ALLOWED_TRANSITIONS.includes(toStatus)) {
    throw new Error("Cliente só pode cancelar o próprio agendamento — as demais transições são de responsabilidade da equipe.");
  }
}

export async function transitionAppointmentStatus(params: {
  ctx: AuthenticatedContext;
  appointmentId: string;
  toStatus: AppointmentStatus;
  overrideReason?: string;
  /** Campos extras a gravar junto (ex.: cancellationFeeApplied) — uso interno. */
  extraData?: Record<string, unknown>;
}) {
  const { ctx, appointmentId, toStatus, overrideReason, extraData } = params;

  return withAppContext(ctx, async (tx) => {
    const appointment = await tx.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });

    const isLegal = LEGAL_TRANSITIONS[appointment.status].includes(toStatus);
    const isOverride = !isLegal;

    if (isOverride) {
      if (ctx.role !== "ADMIN") {
        throw new IllegalTransitionError(appointment.status, toStatus);
      }
      if (!overrideReason?.trim()) {
        throw new Error(
          "Para forçar essa transição fora do fluxo normal, informe o motivo.",
        );
      }
    } else {
      assertRoleCanTransition(ctx, toStatus);
    }

    const isCancelling = toStatus === "CANCELLED";
    const updated = await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: toStatus,
        ...(isCancelling
          ? { cancelledAt: new Date(), cancelledBy: ctx.sessionUserId }
          : {}),
        ...extraData,
      },
    });

    // tx.appointmentStatusLog.create() (via Prisma) falha aqui com violação de
    // RLS mesmo quando a policy está correta e uma query bruta equivalente
    // funciona (confirmado manualmente) — parece ser uma interação específica
    // do novo query-interpreter do Prisma 7 com policies de INSERT baseadas em
    // EXISTS contra outra tabela com RLS. $executeRaw parametrizado contorna
    // isso sem abrir mão de RLS nem de parametrização seguro.
    await tx.$executeRaw`
      INSERT INTO "AppointmentStatusLog" (id, "appointmentId", "fromStatus", "toStatus", "changedBy", "isOverride", "reason", "createdAt")
      VALUES (gen_random_uuid()::text, ${appointmentId}::text, ${appointment.status}::"AppointmentStatus", ${toStatus}::"AppointmentStatus", ${ctx.sessionUserId}::text, ${isOverride}, ${overrideReason ?? null}, now())
    `;

    if (isOverride) {
      await tx.activityLog.create({
        data: {
          actorUserId: ctx.sessionUserId,
          action: "APPOINTMENT_STATUS_OVERRIDE",
          entityType: "Appointment",
          entityId: appointmentId,
          metadata: {
            fromStatus: appointment.status,
            toStatus,
            reason: overrideReason,
          },
        },
      });
    }

    if (toStatus === "NO_SHOW") {
      const client = await tx.client.update({
        where: { id: appointment.clientId },
        data: { noShowCount: { increment: 1 } },
      });
      const settings = await tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } });
      if (
        client.noShowCount >= settings.noShowThreshold &&
        settings.noShowAction === "BLOCK_ONLINE_BOOKING" &&
        !client.blocked
      ) {
        await tx.client.update({ where: { id: client.id }, data: { blocked: true } });
        await tx.activityLog.create({
          data: {
            actorUserId: ctx.sessionUserId,
            action: "CLIENT_AUTO_BLOCKED_NOSHOW",
            entityType: "Client",
            entityId: client.id,
            metadata: { noShowCount: client.noShowCount },
          },
        });
      }
    }

    return updated;
  });
}
