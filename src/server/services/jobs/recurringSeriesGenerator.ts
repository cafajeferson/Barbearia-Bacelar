import { withAppContext } from "@/server/db/context";
import { addDays, addMinutesToTime, startOfDay } from "@/shared/lib/time";

const ADMIN_CTX = { role: "ADMIN" as const, userId: null };

/**
 * Materializa os próximos agendamentos de cada RecurringSeries ativa, dentro
 * da janela configurada (SystemSettings.recurringGenerationWindowDays).
 * Sempre gera linhas REAIS de Appointment — nunca "lazy" — porque elas
 * precisam ser editáveis/arrastáveis/canceláveis individualmente na Agenda
 * Mestre, como qualquer outro agendamento.
 *
 * Autocura: se `nextRunDate` ficou pra trás (o job não rodou por um tempo),
 * este loop cobre TODAS as ocorrências entre `nextRunDate` e a janela atual,
 * não só a próxima — nunca perde uma ocorrência por atraso do agendador.
 *
 * Conflito de horário (ex.: o profissional já tem outro compromisso na data
 * calculada) NUNCA é forçado automaticamente — a ocorrência é pulada, a
 * série é marcada `riskFlag=true` (aparece em "Em atenção" na tela de
 * Recorrências) e um ActivityLog registra o motivo, pra um humano decidir.
 */
export async function generateRecurringAppointments() {
  const settings = await withAppContext(ADMIN_CTX, (tx) =>
    tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } }),
  );
  const windowEnd = addDays(startOfDay(new Date()), settings.recurringGenerationWindowDays);

  const activeSeries = await withAppContext(ADMIN_CTX, (tx) =>
    tx.recurringSeries.findMany({
      where: { status: "ACTIVE", nextRunDate: { lte: windowEnd } },
      include: { services: { include: { service: true } } },
    }),
  );

  let appointmentsCreated = 0;
  let conflicts = 0;

  for (const series of activeSeries) {
    const dates: Date[] = [];
    let cursor = series.nextRunDate;
    while (cursor <= windowEnd) {
      dates.push(cursor);
      cursor = addDays(cursor, series.intervalDays);
    }

    let occurrencesGenerated = series.occurrencesGenerated;
    const durationMinutes = series.services.reduce((sum, s) => sum + s.service.durationMinutes, 0);
    const totalPrice = series.services.reduce((sum, s) => sum + Number(s.service.price), 0);
    const endTime = addMinutesToTime(series.startTime, durationMinutes);

    for (const date of dates) {
      try {
        const created = await withAppContext(ADMIN_CTX, async (tx) => {
          const exists = await tx.appointment.findFirst({
            where: { recurringSeriesId: series.id, scheduledDate: date },
          });
          if (exists) return false;

          const appointment = await tx.appointment.create({
            data: {
              unitId: series.unitId,
              clientId: series.clientId,
              professionalId: series.professionalId,
              status: "SCHEDULED",
              source: "RECURRING_GENERATED",
              scheduledDate: date,
              startTime: series.startTime,
              endTime,
              totalPrice,
              isRecurring: true,
              recurringSeriesId: series.id,
              createdBy: "system:recurringSeriesGenerator",
              services: {
                create: series.services.map((s) => ({
                  serviceId: s.serviceId,
                  priceAtBooking: s.service.price,
                  durationAtBooking: s.service.durationMinutes,
                })),
              },
            },
          });
          await tx.activityLog.create({
            data: {
              action: "RECURRING_APPOINTMENT_GENERATED",
              entityType: "Appointment",
              entityId: appointment.id,
              metadata: { recurringSeriesId: series.id, scheduledDate: date.toISOString() },
            },
          });
          return true;
        });
        if (created) {
          appointmentsCreated++;
          occurrencesGenerated++;
        }
      } catch (err) {
        conflicts++;
        await withAppContext(ADMIN_CTX, (tx) =>
          tx.recurringSeries.update({ where: { id: series.id }, data: { riskFlag: true } }),
        );
        await withAppContext(ADMIN_CTX, (tx) =>
          tx.activityLog.create({
            data: {
              action: "RECURRING_APPOINTMENT_CONFLICT",
              entityType: "RecurringSeries",
              entityId: series.id,
              metadata: {
                scheduledDate: date.toISOString(),
                error: err instanceof Error ? err.message : String(err),
              },
            },
          }),
        );
      }
    }

    await withAppContext(ADMIN_CTX, (tx) =>
      tx.recurringSeries.update({
        where: { id: series.id },
        data: { nextRunDate: cursor, occurrencesGenerated },
      }),
    );
  }

  return { seriesProcessed: activeSeries.length, appointmentsCreated, conflicts };
}
