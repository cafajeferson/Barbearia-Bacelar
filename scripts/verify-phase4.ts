import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db/client";
import { withAppContext, type AppContext } from "../src/server/db/context";
import type { AuthenticatedContext } from "../src/server/auth/getAuthContext";
import * as commissions from "../src/features/commissions/service";
import * as subscriptions from "../src/features/subscriptions/service";
import * as promotions from "../src/features/promotions/service";
import * as coupons from "../src/features/coupons/service";

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

  const periodMonth = new Date();
  periodMonth.setDate(1);
  periodMonth.setHours(0, 0, 0, 0);

  // Limpeza pra idempotência
  await withAppContext(admin, async (tx) => {
    await tx.commissionEntry.deleteMany({ where: { periodMonth } });
    await tx.subscriptionCreditUsage.deleteMany({});
    await tx.clientSubscription.deleteMany({});
    await tx.subscriptionPlan.deleteMany({ where: { name: "Plano de Teste" } });
    await tx.promotion.deleteMany({ where: { name: "Promoção de Teste" } });
    await tx.coupon.deleteMany({ where: { code: { startsWith: "TESTE" } } });
    // Cupom de retorno é nomeado com o dia de hoje (RETORNO-NOME-DDMMAA) — sem
    // limpar aqui, reexecutar no mesmo dia colide com o código único de uma
    // run anterior (o cliente de teste é recriado, o cupom órfão não — a FK
    // opcional só desassocia o clientId, não apaga a linha). Como qualquer
    // cliente de teste "sem agendamento" de QUALQUER script (ex.: "Fulano de
    // Teste" da Fase 2) também é pego pelo gerador de retorno, limpamos todos
    // os cupons RETORNO-* aqui — é banco de dev, sem custo apagar.
    await tx.coupon.deleteMany({ where: { code: { startsWith: "RETORNO-" } } });
    // Limpa TODOS os agendamentos deste profissional (não só os desta suíte) —
    // scripts de verificação de outras fases podem ter deixado resíduo no
    // mesmo mês, o que contaminaria o cálculo de comissão abaixo.
    const staleIds = (await tx.appointment.findMany({ where: { professionalId: professional.id }, select: { id: true } })).map((a) => a.id);
    if (staleIds.length > 0) {
      await tx.couponRedemption.deleteMany({ where: { appointmentId: { in: staleIds } } });
    }
    await tx.appointment.deleteMany({ where: { professionalId: professional.id } });
    await tx.client.deleteMany({ where: { name: "Cliente Inativo Teste" } });
  });

  console.log("1) Comissão de serviço: criar 2 atendimentos concluídos e recalcular");
  const day = new Date();
  day.setDate(day.getDate() - 1);
  day.setHours(0, 0, 0, 0);
  if (day.getMonth() !== periodMonth.getMonth()) {
    // evita cruzar mês em dias 1; usa hoje mesmo nesse caso raro
    day.setTime(new Date().setHours(0, 0, 0, 0));
  }

  await withAppContext(admin, (tx) =>
    tx.professional.update({ where: { id: professional.id }, data: { commissionServicePct: 40 } }),
  );

  await withAppContext(admin, async (tx) => {
    for (const price of [100, 50]) {
      await tx.appointment.create({
        data: {
          unitId: unit.id,
          clientId: client.id,
          professionalId: professional.id,
          status: "COMPLETED",
          source: "ADMIN_MANUAL",
          scheduledDate: day,
          startTime: "08:00",
          endTime: "08:30",
          totalPrice: price,
          notes: "verify-phase4",
          createdBy: admin.sessionUserId,
          services: { create: [{ serviceId: svc.id, priceAtBooking: price, durationAtBooking: 30 }] },
        },
      });
    }
  });

  const result = await commissions.recalculateCommissions({ ctx: admin, periodMonth: day });
  assert.ok(result.appointmentsProcessed >= 2);
  const serviceCommissions = await commissions.listServiceCommissions({ ctx: admin, periodMonth: day });
  const profEntry = serviceCommissions.find((e) => e.professionalId === professional.id);
  assert.ok(profEntry, "deveria ter comissão calculada pro profissional");
  const expected = (100 * 40) / 100 + (50 * 40) / 100;
  assert.equal(profEntry!.pending, expected);
  console.log(`   OK — comissão calculada: R$${profEntry!.pending} (esperado R$${expected})`);

  console.log("2) Recalcular de novo é idempotente (não duplica)");
  await commissions.recalculateCommissions({ ctx: admin, periodMonth: day });
  const serviceCommissions2 = await commissions.listServiceCommissions({ ctx: admin, periodMonth: day });
  const profEntry2 = serviceCommissions2.find((e) => e.professionalId === professional.id);
  assert.equal(profEntry2!.pending, expected);
  console.log("   OK — mesmo valor após recalcular de novo");

  console.log("3) Marcar comissão como paga");
  await commissions.markCommissionsPaid({ ctx: admin, professionalId: professional.id, periodMonth: day, type: "SERVICE" });
  const afterPaid = await commissions.listServiceCommissions({ ctx: admin, periodMonth: day });
  const paidEntry = afterPaid.find((e) => e.professionalId === professional.id);
  assert.equal(paidEntry!.pending, 0);
  assert.equal(paidEntry!.paid, expected);
  console.log("   OK — pendente zerado, pago com o valor certo");

  console.log("4) Assinaturas: criar plano, solicitar, aprovar, e comissão de assinatura via pool");
  const plan = await subscriptions.createSubscriptionPlan({
    ctx: admin,
    name: "Plano de Teste",
    priceMonthly: 100,
    creditLimitPerMonth: 4,
    serviceIds: [svc.id],
  });
  const sub = await subscriptions.requestClientSubscription({ ctx: admin, clientId: client.id, planId: plan.id });
  assert.equal(sub.status, "PENDING");
  const approved = await subscriptions.approveClientSubscription({ ctx: admin, subscriptionId: sub.id });
  assert.equal(approved.status, "ACTIVE");
  assert.ok(approved.nextBillingDate);
  console.log("   OK — assinatura pendente -> aprovada, próxima cobrança definida");

  const subAppointment = await withAppContext(admin, (tx) =>
    tx.appointment.create({
      data: {
        unitId: unit.id,
        clientId: client.id,
        professionalId: professional.id,
        status: "COMPLETED",
        source: "APP",
        scheduledDate: day,
        startTime: "09:00",
        endTime: "09:30",
        totalPrice: 0,
        notes: "verify-phase4",
        createdBy: admin.sessionUserId,
        services: { create: [{ serviceId: svc.id, priceAtBooking: 0, durationAtBooking: 30 }] },
      },
    }),
  );
  await withAppContext(admin, (tx) =>
    tx.subscriptionCreditUsage.create({
      data: { clientSubscriptionId: sub.id, appointmentId: subAppointment.id, creditsUsed: 1 },
    }),
  );

  await commissions.recalculateCommissions({ ctx: admin, periodMonth: day });
  const subCommissions = await commissions.listSubscriptionCommissions({ ctx: admin, periodMonth: day });
  const subProfEntry = subCommissions.find((e) => e.professionalId === professional.id);
  // pool = 100/2 = 50; 1 atendimento coberto no total -> per attendance = 50; profissional fez 1 -> 50
  assert.ok(subProfEntry, "deveria ter comissão de assinatura calculada");
  assert.equal(subProfEntry!.pending, 50);
  console.log(`   OK — comissão de assinatura via pool: R$${subProfEntry!.pending} (esperado R$50)`);

  console.log("5) Pausar/reativar assinatura, crédito manual");
  await subscriptions.setClientSubscriptionStatus({ ctx: admin, subscriptionId: sub.id, status: "PAUSED" });
  const afterPause = await subscriptions.listClientSubscriptions({ ctx: admin, status: "PAUSED" });
  assert.ok(afterPause.some((s) => s.id === sub.id));
  await subscriptions.setClientSubscriptionStatus({ ctx: admin, subscriptionId: sub.id, status: "ACTIVE" });
  await subscriptions.addManualCreditUsage({ ctx: admin, subscriptionId: sub.id });
  const afterCredit = await withAppContext(admin, (tx) => tx.clientSubscription.findUniqueOrThrow({ where: { id: sub.id } }));
  assert.equal(afterCredit.creditsUsedThisPeriod, 1);
  console.log("   OK — pausa/reativação e crédito manual funcionando");

  console.log("6) Promoções: criar e listar");
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);
  const promo = await promotions.createPromotion({
    ctx: admin,
    name: "Promoção de Teste",
    tag: "Geral",
    startDate,
    endDate,
    services: [{ serviceId: svc.id, originalPrice: 45, promoPrice: 35 }],
  });
  const promoList = await promotions.listPromotions({ ctx: admin });
  assert.ok(promoList.some((p) => p.id === promo.id && p.services.length === 1));
  console.log("   OK — promoção criada com serviço associado");

  console.log("7) Cupons: criação manual + geração automática de retorno");
  const manualCoupon = await coupons.createCoupon({
    ctx: admin,
    code: "TESTE10",
    name: "Cupom manual de teste",
    discountType: "PERCENT",
    discountValue: 10,
    validFrom: new Date(),
    validUntil: endDate,
    usageLimit: 1,
  });
  assert.equal(manualCoupon.status, "ACTIVE");
  console.log("   OK — cupom manual criado");

  // Cliente "inativo": sem agendamento nos últimos 90 dias
  const inactiveClient = await withAppContext(admin, (tx) =>
    tx.client.create({ data: { name: "Cliente Inativo Teste", phone: "(81) 98888-0000" } }),
  );
  const generated1 = await coupons.generateRetentionCoupons({ ctx: admin, daysInactive: 30 });
  const forInactive = generated1.find((g) => g.clientId === inactiveClient.id);
  assert.ok(forInactive, "deveria ter gerado cupom de retorno pro cliente inativo");
  assert.match(forInactive!.code, /^RETORNO-CLIENTEINATIVOTESTE-\d{6}$/);
  console.log(`   OK — cupom de retorno gerado: ${forInactive!.code}`);

  const notif = await withAppContext(admin, (tx) =>
    tx.notificationLog.findFirst({ where: { clientId: inactiveClient.id, template: "retention_coupon" } }),
  );
  assert.ok(notif, "deveria ter registrado notificação in-app do cupom");
  console.log("   OK — notificação in-app registrada");

  console.log("8) Rodar geração de novo não duplica cupom pro mesmo cliente");
  const generated2 = await coupons.generateRetentionCoupons({ ctx: admin, daysInactive: 30 });
  const duplicated = generated2.find((g) => g.clientId === inactiveClient.id);
  assert.equal(duplicated, undefined);
  console.log("   OK — sem duplicação");

  console.log("\nTODAS AS VERIFICAÇÕES DA FASE 4 PASSARAM ✅");
}

main()
  .catch((err) => {
    console.error("FALHA NA VERIFICAÇÃO:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
