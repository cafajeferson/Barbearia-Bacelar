import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db/client";
import { withAppContext, type AppContext } from "../src/server/db/context";
import type { AuthenticatedContext } from "../src/server/auth/getAuthContext";
import * as professionals from "../src/features/professionals/service";
import { createAppointment } from "../src/features/appointments/service";
import { transitionAppointmentStatus } from "../src/features/appointments/stateMachine";
import { cancelAppointment } from "../src/features/appointments/service";

function ctxFor(role: AppContext["role"], userId: string | null, sessionUserId: string): AuthenticatedContext {
  return { role, userId, sessionUserId };
}

async function main() {
  const bootstrap = ctxFor("ADMIN", null, "bootstrap");
  const adminUser = await withAppContext(bootstrap, (tx) => tx.user.findFirstOrThrow({ where: { role: "ADMIN" } }));
  const admin = ctxFor("ADMIN", null, adminUser.id);

  const professionalA = await withAppContext(admin, (tx) => tx.professional.findFirstOrThrow());
  const client = await withAppContext(admin, (tx) => tx.client.findFirstOrThrow());
  const svc = await withAppContext(admin, (tx) => tx.service.findFirstOrThrow());
  const unit = await withAppContext(admin, (tx) => tx.unit.findFirstOrThrow());

  const day = new Date();
  day.setDate(day.getDate() + 12);
  day.setHours(0, 0, 0, 0);

  // Limpeza + segundo profissional pra testar isolamento entre agendas.
  await withAppContext(admin, async (tx) => {
    await tx.appointment.deleteMany({ where: { scheduledDate: day } });
    const staleUser = await tx.user.findUnique({ where: { email: "profissional-b@bacelar.dev" } });
    if (staleUser) {
      const staleProf = await tx.professional.findUnique({ where: { userId: staleUser.id } });
      if (staleProf) {
        // Não é só o dia `day`: runs anteriores podem ter deixado agendamentos
        // em outras datas pra este profissional de teste (ex.: um `day` que
        // calculou diferente antes). Limpa tudo que referencia ele, não só hoje.
        const staleAppts = await tx.appointment.findMany({ where: { professionalId: staleProf.id }, select: { id: true } });
        const staleApptIds = staleAppts.map((a) => a.id);
        if (staleApptIds.length > 0) {
          await tx.couponRedemption.deleteMany({ where: { appointmentId: { in: staleApptIds } } });
          await tx.subscriptionCreditUsage.deleteMany({ where: { appointmentId: { in: staleApptIds } } });
          await tx.appointment.deleteMany({ where: { id: { in: staleApptIds } } });
        }
        await tx.commissionEntry.deleteMany({ where: { professionalId: staleProf.id } });
        await tx.productSale.deleteMany({ where: { professionalId: staleProf.id } });
        await tx.recurringSeries.deleteMany({ where: { professionalId: staleProf.id } });
        await tx.blockedSlot.deleteMany({ where: { professionalId: staleProf.id } });
        await tx.weeklyAvailability.deleteMany({ where: { professionalId: staleProf.id } });
        await tx.professionalUnit.deleteMany({ where: { professionalId: staleProf.id } });
      }
      await tx.professional.deleteMany({ where: { userId: staleUser.id } });
      await tx.user.delete({ where: { id: staleUser.id } });
    }
  });

  const professionalB = await professionals.createProfessional({
    ctx: admin,
    name: "Profissional B Teste",
    email: "profissional-b@bacelar.dev",
    password: "senha123",
    unitIds: [unit.id],
  });
  const professionalBUser = await withAppContext(admin, (tx) => tx.professional.findUniqueOrThrow({ where: { id: professionalB.id } }));
  const ctxB = ctxFor("PROFESSIONAL", professionalB.id, professionalBUser.userId);

  const professionalAUser = await withAppContext(admin, (tx) => tx.professional.findUniqueOrThrow({ where: { id: professionalA.id } }));
  const ctxA = ctxFor("PROFESSIONAL", professionalA.id, professionalAUser.userId);

  console.log("1) Cria 1 atendimento pra cada profissional no mesmo dia");
  const apptA = await createAppointment({
    ctx: admin, unitId: unit.id, professionalId: professionalA.id, clientId: client.id,
    serviceIds: [svc.id], scheduledDate: day, startTime: "09:00", source: "ADMIN_MANUAL",
  });
  await createAppointment({
    ctx: admin, unitId: unit.id, professionalId: professionalB.id, clientId: client.id,
    serviceIds: [svc.id], scheduledDate: day, startTime: "09:00", source: "ADMIN_MANUAL",
  });
  console.log("   OK");

  console.log("2) Profissional A só vê o próprio atendimento em getOwnDayData");
  const dayDataA = await professionals.getOwnDayData({ ctx: ctxA, date: day });
  assert.equal(dayDataA.appointments.length, 1);
  assert.equal(dayDataA.appointments[0].professionalId, professionalA.id);
  console.log("   OK — 1 atendimento, é o dele mesmo");

  console.log("3) Profissional B só vê o próprio, não o de A");
  const dayDataB = await professionals.getOwnDayData({ ctx: ctxB, date: day });
  assert.equal(dayDataB.appointments.length, 1);
  assert.equal(dayDataB.appointments[0].professionalId, professionalB.id);
  console.log("   OK — isolamento confirmado");

  console.log("4) Profissional A confirma e conclui o próprio atendimento (fluxo normal, sem override)");
  await transitionAppointmentStatus({ ctx: ctxA, appointmentId: apptA.id, toStatus: "CONFIRMED" });
  await transitionAppointmentStatus({ ctx: ctxA, appointmentId: apptA.id, toStatus: "IN_PROGRESS" });
  await transitionAppointmentStatus({ ctx: ctxA, appointmentId: apptA.id, toStatus: "COMPLETED" });
  const afterComplete = await professionals.getOwnDayData({ ctx: ctxA, date: day });
  assert.equal(afterComplete.kpis.completedCount, 1);
  assert.equal(afterComplete.kpis.revenue, Number(svc.price));
  console.log(`   OK — KPIs: concluídos=${afterComplete.kpis.completedCount}, receita=${afterComplete.kpis.revenue}`);

  console.log("5) Profissional B NÃO consegue tocar no atendimento de A (RLS bloqueia)");
  await assert.rejects(() =>
    transitionAppointmentStatus({ ctx: ctxB, appointmentId: apptA.id, toStatus: "CONFIRMED" }),
  );
  console.log("   OK — bloqueado como esperado");

  console.log("6) Profissional B marca o próprio atendimento como NO_SHOW (precisa dar UPDATE em Client)");
  const clientBefore = await withAppContext(admin, (tx) => tx.client.findUniqueOrThrow({ where: { id: client.id } }));
  const apptB = dayDataB.appointments[0];
  await transitionAppointmentStatus({ ctx: ctxB, appointmentId: apptB.id, toStatus: "NO_SHOW" });
  const clientAfter = await withAppContext(admin, (tx) => tx.client.findUniqueOrThrow({ where: { id: client.id } }));
  assert.equal(clientAfter.noShowCount, clientBefore.noShowCount + 1);
  console.log(`   OK — noShowCount ${clientBefore.noShowCount} -> ${clientAfter.noShowCount}`);

  console.log("7) Cliente cancela o próprio agendamento (regressão: também precisa do INSERT em AppointmentStatusLog)");
  const clientCtx = ctxFor("CLIENT", client.id, client.userId ?? adminUser.id);
  const apptForCancel = await createAppointment({
    ctx: admin, unitId: unit.id, professionalId: professionalA.id, clientId: client.id,
    serviceIds: [svc.id], scheduledDate: day, startTime: "18:00", source: "ADMIN_MANUAL",
  });
  await cancelAppointment({ ctx: clientCtx, appointmentId: apptForCancel.id, reason: "Imprevisto" });
  const cancelled = await withAppContext(admin, (tx) => tx.appointment.findUniqueOrThrow({ where: { id: apptForCancel.id } }));
  assert.equal(cancelled.status, "CANCELLED");
  console.log("   OK — cliente cancelou o próprio agendamento sem erro");

  console.log("\nTODAS AS VERIFICAÇÕES DA FASE 6 PASSARAM ✅");
}

main()
  .catch((err) => {
    console.error("FALHA NA VERIFICAÇÃO:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
