import { withAppContext } from "@/server/db/context";
import { combineDateAndTime } from "@/shared/lib/time";
import { transitionAppointmentStatus } from "@/features/appointments/stateMachine";

const ADMIN_CTX = { role: "ADMIN" as const, userId: null, sessionUserId: "system:noShowSweep" };

/**
 * Marca como NO_SHOW agendamentos SCHEDULED/CONFIRMED cujo horário já passou
 * há mais que a folga configurada (SystemSettings.noShowSweepGraceHours,
 * padrão 2h). Sempre reversível pelo admin (é só mais uma transição de
 * status, com log — ver stateMachine.ts).
 */
export async function sweepNoShows() {
  const settings = await withAppContext(ADMIN_CTX, (tx) =>
    tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } }),
  );

  const candidates = await withAppContext(ADMIN_CTX, (tx) =>
    tx.appointment.findMany({
      where: { status: { in: ["SCHEDULED", "CONFIRMED"] } },
      select: { id: true, scheduledDate: true, endTime: true },
    }),
  );

  const now = Date.now();
  const overdue = candidates.filter(
    (a) => now - combineDateAndTime(a.scheduledDate, a.endTime).getTime() > settings.noShowSweepGraceHours * 3_600_000,
  );

  let marked = 0;
  for (const a of overdue) {
    try {
      await transitionAppointmentStatus({
        ctx: ADMIN_CTX,
        appointmentId: a.id,
        toStatus: "NO_SHOW",
        overrideReason: `Varredura automática: sem confirmação/conclusão ${settings.noShowSweepGraceHours}h após o horário.`,
      });
      marked++;
    } catch {
      // Estado pode ter mudado entre a leitura e a transição (ex.: alguém
      // já concluiu manualmente) — best-effort, segue pro próximo.
    }
  }

  return { checked: candidates.length, markedNoShow: marked };
}
