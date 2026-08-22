import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db/client";
import { withAppContext, type AppContext } from "../src/server/db/context";
import type { AuthenticatedContext } from "../src/server/auth/getAuthContext";
import * as appointments from "../src/features/appointments/service";
import { getAvailableSlots } from "../src/features/appointments/availability";
import { BookingConflictError } from "../src/features/appointments/errors";
import { IllegalTransitionError, transitionAppointmentStatus } from "../src/features/appointments/stateMachine";
import * as clients from "../src/features/clients/service";
import * as professionals from "../src/features/professionals/service";
import * as catalog from "../src/features/catalog/service";
import * as inventory from "../src/features/inventory/service";

function ctxFor(role: AppContext["role"], userId: string | null, sessionUserId = userId ?? "system"): AuthenticatedContext {
  return { role, userId, sessionUserId };
}

async function main() {
  const bootstrap = ctxFor("ADMIN", null, "bootstrap");

  const adminUser = await withAppContext(bootstrap, (tx) => tx.user.findFirstOrThrow({ where: { role: "ADMIN" } }));
  const unit = await withAppContext(bootstrap, (tx) => tx.unit.findFirstOrThrow());
  const professional = await withAppContext(bootstrap, (tx) => tx.professional.findFirstOrThrow());
  const client = await withAppContext(bootstrap, (tx) => tx.client.findFirstOrThrow());
  const svc = await withAppContext(bootstrap, (tx) => tx.service.findFirstOrThrow());

  const admin = ctxFor("ADMIN", null, adminUser.id);
  const professionalCtx = ctxFor("PROFESSIONAL", professional.id, professional.userId);
  const clientCtx = ctxFor("CLIENT", client.id, client.userId ?? adminUser.id);

  // Script idempotente: limpa dados de execuções anteriores antes de rodar de novo.
  await withAppContext(admin, async (tx) => {
    const staleIds = (await tx.appointment.findMany({ where: { professionalId: professional.id }, select: { id: true } })).map((a) => a.id);
    if (staleIds.length > 0) {
      await tx.couponRedemption.deleteMany({ where: { appointmentId: { in: staleIds } } });
      await tx.subscriptionCreditUsage.deleteMany({ where: { appointmentId: { in: staleIds } } });
    }
    await tx.appointment.deleteMany({ where: { professionalId: professional.id } });
    await tx.blockedSlot.deleteMany({ where: { professionalId: professional.id } });
    await tx.client.deleteMany({ where: { name: "Fulano de Teste" } });
    await tx.service.deleteMany({ where: { name: "Serviço de Teste" } });
    await tx.serviceSection.deleteMany({ where: { name: "Seção de Teste" } });
    await tx.product.deleteMany({ where: { name: "Pomada de Teste" } });
  });

  // Data futura garantida dentro da janela de disponibilidade semanal (seg-sáb 09-19h)
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  while (futureDate.getDay() === 0) futureDate.setDate(futureDate.getDate() + 1);
  futureDate.setHours(0, 0, 0, 0);

  console.log("1) Disponibilidade calculada (deve incluir 10:00 antes de qualquer agendamento)");
  const slotsBefore = await getAvailableSlots({ professionalId: professional.id, date: futureDate, durationMinutes: 30 });
  assert.ok(slotsBefore.includes("10:00"), "10:00 deveria estar livre");
  console.log("   OK —", slotsBefore.length, "horários livres");

  console.log("2) Criar agendamento normal às 10:00");
  const appt1 = await appointments.createAppointment({
    ctx: admin,
    unitId: unit.id,
    professionalId: professional.id,
    clientId: client.id,
    serviceIds: [svc.id],
    scheduledDate: futureDate,
    startTime: "10:00",
    source: "ADMIN_MANUAL",
  });
  assert.equal(appt1.status, "SCHEDULED");
  console.log("   OK — appt1", appt1.id, appt1.startTime, "-", appt1.endTime);

  console.log("3) Tentar criar agendamento conflitante (mesma faixa) sem forceOverlap — deve falhar");
  await assert.rejects(
    () =>
      appointments.createAppointment({
        ctx: admin,
        unitId: unit.id,
        professionalId: professional.id,
        clientId: client.id,
        serviceIds: [svc.id],
        scheduledDate: futureDate,
        startTime: "10:00",
        source: "ADMIN_MANUAL",
      }),
    BookingConflictError,
  );
  console.log("   OK — bloqueado como esperado");

  console.log("4) Forçar sobreposição como ADMIN com motivo — deve funcionar e logar");
  const appt2 = await appointments.createAppointment({
    ctx: admin,
    unitId: unit.id,
    professionalId: professional.id,
    clientId: client.id,
    serviceIds: [svc.id],
    scheduledDate: futureDate,
    startTime: "10:00",
    source: "WALK_IN",
    forceOverlap: true,
    overrideReason: "Cliente chegou sem agendar, encaixe urgente.",
  });
  const overlapLog = await withAppContext(admin, (tx) =>
    tx.activityLog.findFirst({ where: { entityId: appt2.id, action: "APPOINTMENT_FORCED_OVERLAP" } }),
  );
  assert.ok(overlapLog, "deveria ter gravado ActivityLog do override");
  console.log("   OK — appt2", appt2.id, "forceOverlap=", appt2.forceOverlap);

  console.log("5) Profissional tentando pular etapas (SCHEDULED -> COMPLETED) sem ser admin — deve falhar");
  await assert.rejects(
    () =>
      transitionAppointmentStatus({
        ctx: professionalCtx,
        appointmentId: appt1.id,
        toStatus: "COMPLETED",
      }),
    IllegalTransitionError,
  );
  console.log("   OK — bloqueado como esperado");

  console.log("6) Admin forçando o mesmo pulo sem motivo — deve falhar");
  await assert.rejects(() =>
    transitionAppointmentStatus({ ctx: admin, appointmentId: appt1.id, toStatus: "COMPLETED" }),
  );
  console.log("   OK — exige motivo");

  console.log("7) Admin forçando com motivo — deve funcionar e marcar isOverride=true");
  await transitionAppointmentStatus({
    ctx: admin,
    appointmentId: appt1.id,
    toStatus: "COMPLETED",
    overrideReason: "Cliente já tinha sido atendido, ajuste retroativo.",
  });
  const log = await withAppContext(admin, (tx) =>
    tx.appointmentStatusLog.findFirst({ where: { appointmentId: appt1.id, toStatus: "COMPLETED" } }),
  );
  assert.equal(log?.isOverride, true);
  console.log("   OK — log de override gravado");

  console.log("8) NO_SHOW incrementa noShowCount do cliente");
  const clientBefore = await withAppContext(admin, (tx) => tx.client.findUniqueOrThrow({ where: { id: client.id } }));
  await transitionAppointmentStatus({ ctx: admin, appointmentId: appt2.id, toStatus: "NO_SHOW", overrideReason: "Não compareceu (ajuste de teste)." });
  const clientAfter = await withAppContext(admin, (tx) => tx.client.findUniqueOrThrow({ where: { id: client.id } }));
  assert.equal(clientAfter.noShowCount, clientBefore.noShowCount + 1);
  console.log("   OK — noShowCount", clientBefore.noShowCount, "->", clientAfter.noShowCount);

  console.log("9) Cliente CRUD");
  const newClient = await clients.createClient({ ctx: admin, name: "Fulano de Teste", phone: "(81) 99999-0000" });
  await clients.updateClient({ ctx: admin, clientId: newClient.id, notes: "Prefere corte baixo" });
  const list = await clients.listClients({ ctx: admin, search: "Fulano" });
  assert.equal(list.length, 1);
  console.log("   OK — criado, atualizado e encontrado na busca");

  console.log("10) Bloqueio de horário do profissional reduz disponibilidade");
  const blockDate = new Date(futureDate);
  blockDate.setDate(blockDate.getDate() + 1);
  await professionals.createBlockedSlot({
    ctx: professionalCtx,
    professionalId: professional.id,
    date: blockDate,
    startTime: "12:00",
    endTime: "13:00",
    reason: "Almoço",
  });
  const slotsWithBlock = await getAvailableSlots({ professionalId: professional.id, date: blockDate, durationMinutes: 30 });
  assert.ok(!slotsWithBlock.includes("12:00"), "12:00 deveria estar bloqueado");
  console.log("   OK — 12:00 removido da disponibilidade");

  console.log("11) Cliente tentando se auto-agendar sobre o próprio bloqueio — RLS/regra normal ainda bloqueia overlap");
  await assert.rejects(() =>
    appointments.createAppointment({
      ctx: clientCtx,
      unitId: unit.id,
      professionalId: professional.id,
      serviceIds: [svc.id],
      scheduledDate: blockDate,
      startTime: "12:00",
      source: "APP",
    }),
  );
  console.log("   OK — cliente não conseguiu, e nem poderia forçar overlap (só ADMIN)");

  console.log("12) Catálogo: criar seção + serviço, listar");
  const section = await catalog.createServiceSection({ ctx: admin, name: "Seção de Teste" });
  const service2 = await catalog.createService({
    ctx: admin,
    sectionId: section.id,
    name: "Serviço de Teste",
    durationMinutes: 20,
    price: 30,
  });
  const cat = await catalog.listCatalog({ ctx: admin });
  assert.ok(cat.some((s) => s.id === section.id && s.services.some((sv) => sv.id === service2.id)));
  console.log("   OK — catálogo consistente");

  console.log("13) Estoque: criar produto, ajustar, resumo com alerta de estoque baixo");
  const product = await inventory.createProduct({
    ctx: admin,
    name: "Pomada de Teste",
    price: 25,
    stock: 3,
    lowStockAlert: 5,
  });
  const summary = await inventory.getInventorySummary({ ctx: admin });
  assert.ok(summary.lowStockCount >= 1);
  await inventory.adjustStock({ ctx: admin, productId: product.id, delta: 10 });
  const updatedProduct = await withAppContext(admin, (tx) => tx.product.findUniqueOrThrow({ where: { id: product.id } }));
  assert.equal(updatedProduct.stock, 13);
  console.log("   OK — estoque baixo detectado e ajuste de estoque funcionando");

  console.log("\nTODAS AS VERIFICAÇÕES DA FASE 2 PASSARAM ✅");
}

main()
  .catch((err) => {
    console.error("FALHA NA VERIFICAÇÃO:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
