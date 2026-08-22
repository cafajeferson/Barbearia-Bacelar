import { withAppContext } from "@/server/db/context";
import { combineDateAndTime } from "@/shared/lib/time";
import { sendWhatsAppMessage } from "@/server/services/whatsapp";

const ADMIN_CTX = { role: "ADMIN" as const, userId: null };
const TEMPLATE = "appointment_reminder";

/**
 * Cria (e tenta enviar) lembretes para agendamentos que acontecem daqui a
 * `SystemSettings.reminderHoursBefore` horas. Sempre best-effort: se o
 * WhatsApp não estiver conectado (normal até a Fase 10), o lembrete fica
 * registrado como QUEUED em NotificationLog — nunca impede o agendamento
 * de existir nem lança erro pro chamador.
 */
export async function sendUpcomingReminders() {
  const settings = await withAppContext(ADMIN_CTX, (tx) =>
    tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } }),
  );

  const upcoming = await withAppContext(ADMIN_CTX, (tx) =>
    tx.appointment.findMany({
      where: { status: { in: ["SCHEDULED", "CONFIRMED"] } },
      include: {
        client: true,
        professional: true,
        services: { include: { service: true } },
      },
    }),
  );

  const now = Date.now();
  const windowMs = settings.reminderHoursBefore * 3_600_000;
  const due = upcoming.filter((a) => {
    const scheduledAt = combineDateAndTime(a.scheduledDate, a.startTime).getTime();
    const hoursUntil = scheduledAt - now;
    return hoursUntil > 0 && hoursUntil <= windowMs;
  });

  let queued = 0;
  let sent = 0;

  for (const a of due) {
    const alreadyNotified = await withAppContext(ADMIN_CTX, (tx) =>
      tx.notificationLog.findFirst({
        where: { clientId: a.clientId, template: TEMPLATE, payload: { path: ["appointmentId"], equals: a.id } },
      }),
    );
    if (alreadyNotified) continue;
    // Cliente autocadastrado via Google (Fase 10) pode não ter telefone —
    // sem número não tem como mandar WhatsApp, pula sem travar o job.
    if (!a.client.phone) continue;

    const message = `Lembrete: você tem ${a.services.map((s) => s.service.name).join(" + ")} com ${a.professional.name} em ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(a.scheduledDate)} às ${a.startTime}.`;

    const result = await sendWhatsAppMessage({ phone: a.client.phone, message });

    await withAppContext(ADMIN_CTX, (tx) =>
      tx.notificationLog.create({
        data: {
          clientId: a.clientId,
          channel: "WHATSAPP",
          template: TEMPLATE,
          payload: { appointmentId: a.id, message },
          status: result.sent ? "SENT" : "QUEUED",
          sentAt: result.sent ? new Date() : null,
        },
      }),
    );

    // Espelha como notificação in-app também — o sino do app do cliente
    // não depende do WhatsApp estar conectado.
    await withAppContext(ADMIN_CTX, (tx) =>
      tx.notificationLog.create({
        data: {
          clientId: a.clientId,
          channel: "IN_APP",
          template: TEMPLATE,
          payload: { appointmentId: a.id, message },
          status: "SENT",
          sentAt: new Date(),
        },
      }),
    );

    if (result.sent) sent++;
    else queued++;
  }

  return { candidates: due.length, sentViaWhatsApp: sent, queued };
}
