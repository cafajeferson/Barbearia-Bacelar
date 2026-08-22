import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db/client";
import { withAppContext, type AppContext } from "../src/server/db/context";
import type { AuthenticatedContext } from "../src/server/auth/getAuthContext";
import { bookAppointmentAsClient } from "../src/features/appointments/booking";
import * as subscriptions from "../src/features/subscriptions/service";
import * as coupons from "../src/features/coupons/service";

function ctxFor(role: AppContext["role"], userId: string | null, sessionUserId: string): AuthenticatedContext {
  return { role, userId, sessionUserId };
}

async function main() {
  const bootstrap = ctxFor("ADMIN", null, "bootstrap");
  const adminUser = await withAppContext(bootstrap, (tx) => tx.user.findFirstOrThrow({ where: { role: "ADMIN" } }));
  const admin = ctxFor("ADMIN", null, adminUser.id);

  const professional = await withAppContext(admin, (tx) => tx.professional.findFirstOrThrow());
  const clientRow = await withAppContext(admin, (tx) => tx.client.findFirstOrThrow({ where: { userId: { not: null } } }));
  const svc = await withAppContext(admin, (tx) => tx.service.findFirstOrThrow());
  const unit = await withAppContext(admin, (tx) => tx.unit.findFirstOrThrow());
  const clientCtx = ctxFor("CLIENT", clientRow.id, clientRow.userId!);

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10);
  while (futureDate.getDay() === 0) futureDate.setDate(futureDate.getDate() + 1);
  futureDate.setHours(0, 0, 0, 0);

  await withAppContext(admin, async (tx) => {
    const staleAppointments = await tx.appointment.findMany({
      where: { professionalId: professional.id, scheduledDate: futureDate },
      select: { id: true },
    });
    const staleIds = staleAppointments.map((a) => a.id);
    if (staleIds.length > 0) {
      await tx.couponRedemption.deleteMany({ where: { appointmentId: { in: staleIds } } });
      await tx.subscriptionCreditUsage.deleteMany({ where: { appointmentId: { in: staleIds } } });
    }
    await tx.appointment.deleteMany({ where: { id: { in: staleIds } } });
    await tx.coupon.deleteMany({ where: { code: { startsWith: "VERIFY5" } } });
    await tx.clientSubscription.deleteMany({ where: { clientId: clientRow.id } });
    // "Outro Cliente Verify5" (criado no passo 7) não era limpo entre runs —
    // acumulava um cliente "inativo" a mais a cada execução, o que colidia
    // com o gerador de cupom de retorno (mesmo nome = mesmo código no mesmo dia).
    await tx.client.deleteMany({ where: { name: "Outro Cliente Verify5" } });
  });

  console.log("1) Agendamento simples (Pagar no Local)");
  const appt1 = await bookAppointmentAsClient({
    ctx: clientCtx,
    unitId: unit.id,
    professionalId: professional.id,
    serviceIds: [svc.id],
    scheduledDate: futureDate,
    startTime: "10:00",
    paymentMethod: "LOCAL",
  });
  assert.equal(Number(appt1.totalPrice), Number(svc.price));
  console.log(`   OK — criado, total = ${appt1.totalPrice}`);

  console.log("2) Cupom de desconto percentual aplicado corretamente");
  await coupons.createCoupon({
    ctx: admin,
    code: "VERIFY5-10OFF",
    name: "Teste 10%",
    discountType: "PERCENT",
    discountValue: 10,
    validFrom: new Date(),
    validUntil: new Date(Date.now() + 7 * 86400000),
    usageLimit: 1,
  });
  const appt2 = await bookAppointmentAsClient({
    ctx: clientCtx,
    unitId: unit.id,
    professionalId: professional.id,
    serviceIds: [svc.id],
    scheduledDate: futureDate,
    startTime: "11:00",
    couponCode: "verify5-10off",
    paymentMethod: "LOCAL",
  });
  const expectedPrice = Number(svc.price) * 0.9;
  assert.equal(Number(appt2.totalPrice), expectedPrice);
  const couponAfter = await withAppContext(admin, (tx) => tx.coupon.findUniqueOrThrow({ where: { code: "VERIFY5-10OFF" } }));
  assert.equal(couponAfter.usageCount, 1);
  assert.equal(couponAfter.status, "USED"); // usageLimit=1, então já esgotou
  console.log(`   OK — preço com desconto = ${appt2.totalPrice} (esperado ${expectedPrice}), cupom marcado USED`);

  console.log("3) Cupom já usado (limite atingido) é rejeitado");
  await assert.rejects(() =>
    bookAppointmentAsClient({
      ctx: clientCtx,
      unitId: unit.id,
      professionalId: professional.id,
      serviceIds: [svc.id],
      scheduledDate: futureDate,
      startTime: "12:00",
      couponCode: "VERIFY5-10OFF",
      paymentMethod: "LOCAL",
    }),
  );
  console.log("   OK — rejeitado como esperado");

  console.log("4) Pagar com Assinatura: consome crédito e zera o valor");
  const plan = await subscriptions.createSubscriptionPlan({
    ctx: admin,
    name: "Plano Verify5",
    priceMonthly: 100,
    creditLimitPerMonth: 2,
    serviceIds: [svc.id],
  });
  const sub = await subscriptions.requestClientSubscription({ ctx: clientCtx, clientId: clientRow.id, planId: plan.id });
  await subscriptions.approveClientSubscription({ ctx: admin, subscriptionId: sub.id });

  const appt3 = await bookAppointmentAsClient({
    ctx: clientCtx,
    unitId: unit.id,
    professionalId: professional.id,
    serviceIds: [svc.id],
    scheduledDate: futureDate,
    startTime: "13:00",
    paymentMethod: "SUBSCRIPTION",
    subscriptionId: sub.id,
  });
  assert.equal(Number(appt3.totalPrice), 0);
  const subAfter = await withAppContext(admin, (tx) => tx.clientSubscription.findUniqueOrThrow({ where: { id: sub.id } }));
  assert.equal(subAfter.creditsUsedThisPeriod, 1);
  const usage = await withAppContext(admin, (tx) => tx.subscriptionCreditUsage.findFirst({ where: { appointmentId: appt3.id } }));
  assert.ok(usage);
  console.log("   OK — total zerado, crédito debitado, uso registrado");

  console.log("5) Limite de créditos esgotado é rejeitado");
  await bookAppointmentAsClient({
    ctx: clientCtx, unitId: unit.id, professionalId: professional.id, serviceIds: [svc.id],
    scheduledDate: futureDate, startTime: "14:00", paymentMethod: "SUBSCRIPTION", subscriptionId: sub.id,
  });
  await assert.rejects(() =>
    bookAppointmentAsClient({
      ctx: clientCtx, unitId: unit.id, professionalId: professional.id, serviceIds: [svc.id],
      scheduledDate: futureDate, startTime: "15:00", paymentMethod: "SUBSCRIPTION", subscriptionId: sub.id,
    }),
  );
  console.log("   OK — limite (2 créditos/mês) respeitado");

  console.log("6) Agendamento recorrente cria a série");
  const appt4 = await bookAppointmentAsClient({
    ctx: clientCtx,
    unitId: unit.id,
    professionalId: professional.id,
    serviceIds: [svc.id],
    scheduledDate: futureDate,
    startTime: "16:00",
    paymentMethod: "LOCAL",
    recurring: { intervalDays: 30 },
  });
  assert.equal(appt4.isRecurring, true);
  assert.ok(appt4.recurringSeriesId);
  const series = await withAppContext(admin, (tx) => tx.recurringSeries.findUniqueOrThrow({ where: { id: appt4.recurringSeriesId! } }));
  assert.equal(series.clientId, clientRow.id);
  assert.equal(series.intervalDays, 30);
  console.log("   OK — RecurringSeries criada e vinculada ao agendamento");

  console.log("7) Cliente não pode assinar plano para outro clientId");
  const otherClient = await withAppContext(admin, (tx) => tx.client.create({ data: { name: "Outro Cliente Verify5", phone: "119999" } }));
  await assert.rejects(() =>
    subscriptions.requestClientSubscription({ ctx: clientCtx, clientId: otherClient.id, planId: plan.id }),
  );
  console.log("   OK — bloqueado como esperado");

  console.log("\nTODAS AS VERIFICAÇÕES DA FASE 5 PASSARAM ✅");
}

main()
  .catch((err) => {
    console.error("FALHA NA VERIFICAÇÃO:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
