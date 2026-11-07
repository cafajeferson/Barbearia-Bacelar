import { withAppContext } from "@/server/db/context";
import { closeAppointmentsAsSystem } from "@/features/appointments/autoClose";

const SYSTEM = { role: "ADMIN" as const, userId: null };

/**
 * Conclui sozinho o atendimento que ficou aberto (agendado, confirmado ou
 * em atendimento) mais de N dias depois da data marcada — regra
 * "Fechamento automático" em Configurações. Roda uma vez por dia.
 */
export async function sweepAutoClose() {
  const settings = await withAppContext(SYSTEM, (tx) =>
    tx.systemSettings.findUniqueOrThrow({
      where: { id: 1 },
      select: { autoCloseEnabled: true, autoCloseAfterDays: true },
    }),
  );
  if (!settings.autoCloseEnabled) return { enabled: false, closed: 0 };

  // Último dia que já "venceu": hoje - N dias (coluna somente data, UTC).
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - settings.autoCloseAfterDays));
  const ids = await withAppContext(SYSTEM, async (tx) =>
    (
      await tx.appointment.findMany({
        where: { status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] }, scheduledDate: { lte: cutoff } },
        select: { id: true },
      })
    ).map((a) => a.id),
  );

  const closed = await closeAppointmentsAsSystem(
    ids,
    `Fechado pelo sistema: sem conclusão ${settings.autoCloseAfterDays} dia(s) após o horário.`,
  );
  return { enabled: true, closed };
}
