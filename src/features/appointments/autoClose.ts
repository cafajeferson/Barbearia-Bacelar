import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { syncAppointmentCommission } from "@/features/commissions/service";

const SYSTEM = { role: "ADMIN" as const, userId: null };
const OPEN = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] as const;

/**
 * Conclui atendimentos em aberto em nome do sistema, com o selo
 * "Fechado pelo sistema" (closedBySystem). Grava o histórico de status e
 * lança a comissão como numa conclusão normal. Usado pelo fechamento
 * automático diário e pelo botão "Encerrar até <mês>" da tela Em aberto.
 *
 * Não passa por transitionAppointmentStatus de propósito: lá uma transição
 * fora do fluxo grava ActivityLog com o usuário da sessão como autor, e
 * aqui não há usuário. Ainda assim só toca em quem continua aberto no
 * momento do UPDATE (alguém pode ter concluído à mão no meio do caminho).
 */
export async function closeAppointmentsAsSystem(appointmentIds: string[], reason: string) {
  let closed = 0;
  for (const id of appointmentIds) {
    const done = await withAppContext(SYSTEM, async (tx) => {
      const appt = await tx.appointment.findUnique({ where: { id }, select: { status: true } });
      if (!appt || !OPEN.includes(appt.status as (typeof OPEN)[number])) return false;
      await tx.appointment.update({ where: { id }, data: { status: "COMPLETED", closedBySystem: true } });
      await tx.$executeRaw`
        INSERT INTO "AppointmentStatusLog" (id, "appointmentId", "fromStatus", "toStatus", "changedBy", "isOverride", "reason", "createdAt")
        VALUES (gen_random_uuid()::text, ${id}::text, ${appt.status}::"AppointmentStatus", 'COMPLETED'::"AppointmentStatus", 'system'::text, true, ${reason}, now())
      `;
      return true;
    });
    if (done) {
      closed++;
      try {
        await syncAppointmentCommission(id);
      } catch (err) {
        console.error("[autoClose] comissão não lançada para", id, err);
      }
    }
  }
  return closed;
}

/** Último dia do mês anterior ao atual — limite do botão "Encerrar até <mês>". */
export function endOfPreviousMonth(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0));
}

/** "Encerrar até <mês>": fecha como sistema tudo que ficou aberto até o fim do mês passado. */
export async function closeOpenUntilPreviousMonth(params: { ctx: AuthenticatedContext }) {
  if (params.ctx.role !== "ADMIN") throw new Error("Só admin pode encerrar atendimentos em lote.");
  const until = endOfPreviousMonth();
  const ids = await withAppContext(params.ctx, async (tx) =>
    (
      await tx.appointment.findMany({
        where: { status: { in: [...OPEN] }, scheduledDate: { lte: until } },
        select: { id: true },
      })
    ).map((a) => a.id),
  );
  return closeAppointmentsAsSystem(ids, "Encerrado em lote pelo admin (Em aberto → Encerrar até o mês anterior).");
}

/** Aba "Fechados pelo sistema": concluídos automaticamente nos últimos 60 dias. */
export async function listClosedBySystem(params: { ctx: AuthenticatedContext }) {
  const since = new Date();
  since.setDate(since.getDate() - 60);
  return withAppContext(params.ctx, (tx) =>
    tx.appointment.findMany({
      where: { closedBySystem: true, scheduledDate: { gte: since } },
      include: { client: true, professional: true, services: { include: { service: true } } },
      orderBy: [{ scheduledDate: "desc" }, { startTime: "desc" }],
    }),
  );
}
