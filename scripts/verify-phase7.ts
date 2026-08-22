import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db/client";
import { withAppContext, type AppContext } from "../src/server/db/context";
import type { AuthenticatedContext } from "../src/server/auth/getAuthContext";
import { generateRecurringAppointments } from "../src/server/services/jobs/recurringSeriesGenerator";
import { sweepNoShows } from "../src/server/services/jobs/noShowSweep";
import { sendUpcomingReminders } from "../src/server/services/jobs/reminderScheduler";
import { runCommissionApuracao } from "../src/server/services/jobs/commissionApuracao";
import { addDays, startOfDay } from "../src/shared/lib/time";

function ctxFor(role: AppContext["role"], userId: string | null, sessionUserId: string): AuthenticatedContext {
  return { role, userId, sessionUserId };
}

async function main() {
  const bootstrap = ctxFor("ADMIN", null, "bootstrap");
  const adminUser = await withAppContext(bootstrap, (tx) => tx.user.findFirstOrThrow({ where: { role: "ADMIN" } }));
  const admin = ctxFor("ADMIN", null, adminUser.id);

  const professional = await withAppContext(admin, (tx) => tx.professional.findFirstOrThrow());
  const client = await withAppContext(admin, (tx) => tx.client.findFirstOrThrow());
  const svc = await withAppContext(admin, (tx) => tx.service.findFirstOrThrow());
  const unit = await withAppContext(admin, (tx) => tx.unit.findFirstOrThrow());

  // Limpeza
  await withAppContext(admin, async (tx) => {
    // Limpeza ampla (todos os agendamentos deste profissional, não só os com
    // notes="verify-phase7"): o gerador de recorrência cria linhas SEM essa
    // nota, e apagar a série sem apagar as ocorrências geradas por ela deixa
    // resíduo (recurringSeriesId só fica null, o Appointment continua e
    // colide com a próxima geração no mesmo horário).
    const oldAppts = await tx.appointment.findMany({
      where: { professionalId: professional.id },
      select: { id: true },
    });
    const ids = oldAppts.map((a) => a.id);
    if (ids.length > 0) {
      await tx.appointmentStatusLog.deleteMany({ where: { appointmentId: { in: ids } } });
      await tx.couponRedemption.deleteMany({ where: { appointmentId: { in: ids } } });
      await tx.subscriptionCreditUsage.deleteMany({ where: { appointmentId: { in: ids } } });
      await tx.appointment.deleteMany({ where: { id: { in: ids } } });
    }
    await tx.recurringSeries.deleteMany({ where: { professionalId: professional.id } });
  });

  console.log("1) Gerador de recorrência: série com nextRunDate atrasada gera VÁRIAS ocorrências de uma vez (autocura)");
  const past = addDays(startOfDay(new Date()), -20); // bem atrasada de propósito
  const series = await withAppContext(admin, (tx) =>
    tx.recurringSeries.create({
      data: {
        clientId: client.id,
        professionalId: professional.id,
        unitId: unit.id,
        intervalDays: 7,
        startTime: "10:00",
        startDate: past,
        nextRunDate: past,
        occurrencesGenerated: 0,
        status: "ACTIVE",
        services: { create: [{ serviceId: svc.id }] },
      },
    }),
  );
  const genResult1 = await generateRecurringAppointments();
  assert.ok(genResult1.appointmentsCreated >= 4, `esperava várias ocorrências de catch-up, veio ${genResult1.appointmentsCreated}`);
  const seriesAfter1 = await withAppContext(admin, (tx) => tx.recurringSeries.findUniqueOrThrow({ where: { id: series.id } }));
  assert.equal(seriesAfter1.occurrencesGenerated, genResult1.appointmentsCreated);
  console.log(`   OK — ${genResult1.appointmentsCreated} ocorrências materializadas de uma vez, nextRunDate avançou`);

  console.log("2) Rodar de novo no mesmo instante não duplica");
  const genResult2 = await generateRecurringAppointments();
  const generatedForThisSeries = await withAppContext(admin, (tx) =>
    tx.appointment.count({ where: { recurringSeriesId: series.id } }),
  );
  assert.equal(generatedForThisSeries, genResult1.appointmentsCreated);
  console.log(`   OK — total de agendamentos da série continua ${generatedForThisSeries} (gen2 criou ${genResult2.appointmentsCreated} novas, esperado 0 pra esta série já em dia)`);

  console.log("3) Conflito de horário numa ocorrência futura marca riskFlag e pula, sem travar as outras");
  const conflictSeries = await withAppContext(admin, (tx) =>
    tx.recurringSeries.create({
      data: {
        clientId: client.id,
        professionalId: professional.id,
        unitId: unit.id,
        intervalDays: 100, // só 1 ocorrência dentro da janela, fácil de prever
        startTime: "14:00",
        startDate: addDays(startOfDay(new Date()), 5),
        nextRunDate: addDays(startOfDay(new Date()), 5),
        occurrencesGenerated: 0,
        status: "ACTIVE",
        services: { create: [{ serviceId: svc.id }] },
      },
    }),
  );
  // cria um agendamento concorrente manualmente no mesmo profissional/horário
  await withAppContext(admin, (tx) =>
    tx.appointment.create({
      data: {
        unitId: unit.id, clientId: client.id, professionalId: professional.id,
        status: "SCHEDULED", source: "ADMIN_MANUAL",
        scheduledDate: addDays(startOfDay(new Date()), 5), startTime: "14:00", endTime: "14:30",
        totalPrice: 45, createdBy: "test", notes: "verify-phase7",
      },
    }),
  );
  const genResult3 = await generateRecurringAppointments();
  assert.ok(genResult3.conflicts >= 1, "esperava pelo menos 1 conflito detectado");
  const conflictSeriesAfter = await withAppContext(admin, (tx) => tx.recurringSeries.findUniqueOrThrow({ where: { id: conflictSeries.id } }));
  assert.equal(conflictSeriesAfter.riskFlag, true);
  console.log(`   OK — ${genResult3.conflicts} conflito(s) detectado(s), série marcada em risco, resto do job seguiu normalmente`);

  console.log("4) Varredura de no-show: agendamento vencido há mais que a folga vira NO_SHOW; um recente não");
  const overdueAppt = await withAppContext(admin, (tx) =>
    tx.appointment.create({
      data: {
        unitId: unit.id, clientId: client.id, professionalId: professional.id,
        status: "SCHEDULED", source: "ADMIN_MANUAL",
        scheduledDate: addDays(startOfDay(new Date()), -1), startTime: "08:00", endTime: "08:30",
        totalPrice: 45, createdBy: "test", notes: "verify-phase7",
      },
    }),
  );
  const recentAppt = await withAppContext(admin, (tx) => {
    const in30min = new Date(Date.now() + 30 * 60_000);
    return tx.appointment.create({
      data: {
        unitId: unit.id, clientId: client.id, professionalId: professional.id,
        status: "SCHEDULED", source: "ADMIN_MANUAL",
        scheduledDate: startOfDay(in30min), startTime: `${String(in30min.getHours()).padStart(2, "0")}:${String(in30min.getMinutes()).padStart(2, "0")}`,
        endTime: "23:59",
        totalPrice: 45, createdBy: "test", notes: "verify-phase7",
      },
    });
  });
  const sweepResult = await sweepNoShows();
  assert.ok(sweepResult.markedNoShow >= 1);
  const overdueAfter = await withAppContext(admin, (tx) => tx.appointment.findUniqueOrThrow({ where: { id: overdueAppt.id } }));
  const recentAfter = await withAppContext(admin, (tx) => tx.appointment.findUniqueOrThrow({ where: { id: recentAppt.id } }));
  assert.equal(overdueAfter.status, "NO_SHOW");
  assert.equal(recentAfter.status, "SCHEDULED");
  console.log(`   OK — vencido virou NO_SHOW (${sweepResult.markedNoShow} no total), recente continua SCHEDULED`);

  console.log("5) Lembretes: agendamento dentro da janela gera notificação (WhatsApp enfileirado + in-app), sem duplicar na 2ª chamada");
  const inWindow = new Date(Date.now() + 10 * 3_600_000); // daqui a 10h, dentro das 24h padrão
  // Minuto deliberadamente incomum (:17) pra não colidir com as ocorrências
  // recorrentes ("10:00") nem o conflito ("14:00") criados nos passos anteriores.
  const reminderStartTime = `${String(inWindow.getHours()).padStart(2, "0")}:17`;
  const reminderEndTime = `${String(inWindow.getHours()).padStart(2, "0")}:32`;
  const reminderAppt = await withAppContext(admin, (tx) =>
    tx.appointment.create({
      data: {
        unitId: unit.id, clientId: client.id, professionalId: professional.id,
        status: "SCHEDULED", source: "ADMIN_MANUAL",
        scheduledDate: startOfDay(inWindow),
        startTime: reminderStartTime,
        endTime: reminderEndTime,
        totalPrice: 45, createdBy: "test", notes: "verify-phase7",
      },
    }),
  );
  const reminderResult1 = await sendUpcomingReminders();
  assert.ok(reminderResult1.candidates >= 1);
  const notifs = await withAppContext(admin, (tx) =>
    tx.notificationLog.findMany({ where: { clientId: client.id, template: "appointment_reminder" } }),
  );
  assert.ok(notifs.some((n) => n.channel === "WHATSAPP" && n.status === "QUEUED"));
  assert.ok(notifs.some((n) => n.channel === "IN_APP" && n.status === "SENT"));
  const countBefore = notifs.length;
  await sendUpcomingReminders();
  const notifsAfter = await withAppContext(admin, (tx) =>
    tx.notificationLog.findMany({ where: { clientId: client.id, template: "appointment_reminder" } }),
  );
  assert.equal(notifsAfter.length, countBefore);
  console.log(`   OK — ${countBefore} notificações criadas (WhatsApp QUEUED + in-app SENT), 2ª chamada não duplicou`);
  void reminderAppt;

  console.log("6) Apuração de comissões mira o mês anterior");
  const apuracaoResult = await runCommissionApuracao();
  const expectedMonth = new Date();
  expectedMonth.setMonth(expectedMonth.getMonth() - 1);
  assert.equal(apuracaoResult.periodMonth, expectedMonth.toISOString().slice(0, 7));
  console.log(`   OK — apurou o período ${apuracaoResult.periodMonth}`);

  console.log("\nTODAS AS VERIFICAÇÕES DA FASE 7 PASSARAM ✅");
}

main()
  .catch((err) => {
    console.error("FALHA NA VERIFICAÇÃO:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
