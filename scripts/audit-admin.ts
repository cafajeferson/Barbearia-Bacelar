/**
 * Varredura funcional do que o admin cadastra/edita, usando a mesma lógica
 * das telas. Tudo que cria leva "AUDIT" no nome e é removido no fim.
 */
import "dotenv/config";
import { withAppContext } from "../src/server/db/context";
import { prisma } from "../src/server/db/client";
import * as catalog from "../src/features/catalog/service";
import * as inventory from "../src/features/inventory/service";
import * as subs from "../src/features/subscriptions/service";
import * as coupons from "../src/features/coupons/service";
import * as promos from "../src/features/promotions/service";
import * as clients from "../src/features/clients/service";
import * as settings from "../src/features/settings/service";
import * as commissions from "../src/features/commissions/service";
import * as pros from "../src/features/professionals/service";
import { createAppointment, cancelAppointment } from "../src/features/appointments/service";
import { transitionAppointmentStatus } from "../src/features/appointments/stateMachine";

const BOOT = { role: "ADMIN" as const, userId: null };
let ok = 0;
let fail = 0;
async function check(label: string, fn: () => Promise<string | boolean | void>) {
  try {
    const r = await fn();
    if (r === false) throw new Error("resultado inesperado");
    ok++;
    console.log(`  ✅ ${label}${typeof r === "string" ? ` — ${r}` : ""}`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${label} — ${(e instanceof Error ? e.message : String(e)).split("\n").filter(Boolean).pop()?.slice(0, 160)}`);
  }
}

async function main() {
  const adminUser = await withAppContext(BOOT, (tx) => tx.user.findFirstOrThrow({ where: { role: "ADMIN" } }));
  const ctx = { role: "ADMIN" as const, userId: adminUser.id, sessionUserId: adminUser.id };
  const created: { sections: string[]; services: string[]; products: string[]; plans: string[]; coupons: string[]; promos: string[]; clients: string[]; appts: string[]; blocks: string[] } =
    { sections: [], services: [], products: [], plans: [], coupons: [], promos: [], clients: [], appts: [], blocks: [] };

  console.log("Regras do sistema");
  const before = await settings.getSystemSettings({ ctx });
  await check("alterar e salvar (comissão padrão 44 → 45)", async () => {
    await settings.updateSystemSettings({
      ctx,
      noShowThreshold: before.noShowThreshold, noShowAction: before.noShowAction,
      bookingMinLeadMinutes: before.bookingMinLeadMinutes, bookingMaxLeadDays: before.bookingMaxLeadDays,
      defaultCommissionServicePct: 45, defaultCommissionWalkInPct: Number(before.defaultCommissionWalkInPct),
      defaultCommissionProductPct: Number(before.defaultCommissionProductPct), subscriptionGraceDays: before.subscriptionGraceDays,
      autoCloseEnabled: before.autoCloseEnabled, autoCloseAfterDays: before.autoCloseAfterDays,
    });
    const now = await settings.getSystemSettings({ ctx });
    return Number(now.defaultCommissionServicePct) === 45;
  });
  await check("voltar ao valor original", async () => {
    await settings.updateSystemSettings({
      ctx,
      noShowThreshold: before.noShowThreshold, noShowAction: before.noShowAction,
      bookingMinLeadMinutes: before.bookingMinLeadMinutes, bookingMaxLeadDays: before.bookingMaxLeadDays,
      defaultCommissionServicePct: Number(before.defaultCommissionServicePct), defaultCommissionWalkInPct: Number(before.defaultCommissionWalkInPct),
      defaultCommissionProductPct: Number(before.defaultCommissionProductPct), subscriptionGraceDays: before.subscriptionGraceDays,
      autoCloseEnabled: before.autoCloseEnabled, autoCloseAfterDays: before.autoCloseAfterDays,
    });
    return Number((await settings.getSystemSettings({ ctx })).defaultCommissionServicePct) === Number(before.defaultCommissionServicePct);
  });

  console.log("Catálogo (seções e serviços)");
  let serviceId = "";
  await check("criar seção", async () => { const s = await catalog.createServiceSection({ ctx, name: "AUDIT seção" }); created.sections.push(s.id); });
  await check("criar serviço (R$ 50, 40 min)", async () => {
    const s = await catalog.createService({ ctx, sectionId: created.sections[0], name: "AUDIT Corte teste", durationMinutes: 40, price: 50 });
    serviceId = s.id; created.services.push(s.id);
  });
  await check("editar preço e duração (R$ 60, 45 min)", async () => {
    const s = await catalog.updateService({ ctx, serviceId, price: 60, durationMinutes: 45 });
    return Number(s.price) === 60 && s.durationMinutes === 45;
  });
  await check("desativar e reativar serviço", async () => {
    await catalog.updateService({ ctx, serviceId, active: false });
    const s = await catalog.updateService({ ctx, serviceId, active: true });
    return s.active;
  });
  await check("comissão própria do serviço (50%)", async () => {
    await commissions.updateServiceCommission({ ctx, serviceId, commissionServicePct: 50, commissionWalkInPct: 50 });
    const s = await withAppContext(BOOT, (tx) => tx.service.findUniqueOrThrow({ where: { id: serviceId } }));
    return Number(s.commissionServicePct) === 50;
  });

  console.log("Produtos e estoque");
  let productId = "";
  await check("cadastrar produto (R$ 30, estoque 10, comissão 15%)", async () => {
    const p = await inventory.createProduct({ ctx, name: "AUDIT Pomada", price: 30, stock: 10, lowStockAlert: 3, commissionPct: 15 });
    productId = p.id; created.products.push(p.id);
  });
  await check("editar preço (R$ 35)", async () => Number((await inventory.updateProduct({ ctx, productId, price: 35 })).price) === 35);
  await check("entrada de estoque +5", async () => (await inventory.adjustStock({ ctx, productId, delta: 5 })).stock === 15);
  await check("saída de estoque −3", async () => (await inventory.adjustStock({ ctx, productId, delta: -3 })).stock === 12);
  await check("saída maior que o estoque é recusada", async () => {
    try { await inventory.adjustStock({ ctx, productId, delta: -100 }); return false; } catch { return "recusou"; }
  });

  console.log("Agenda + estoque + comissões (atendimento com produto)");
  const base = await withAppContext(BOOT, async (tx) => ({
    prof: await tx.professional.findFirstOrThrow({ where: { active: true }, orderBy: { name: "asc" } }),
    unit: await tx.unit.findFirstOrThrow({ where: { active: true } }),
    client: await tx.client.findFirstOrThrow({ where: { name: "Cliente 9" } }),
  }));
  let apptId = "";
  await check("criar agendamento com 2 unidades do produto", async () => {
    const a = await createAppointment({
      ctx, unitId: base.unit.id, professionalId: base.prof.id, clientId: base.client.id, serviceIds: [serviceId],
      products: [{ productId, quantity: 2 }], scheduledDate: new Date(Date.UTC(2026, 11, 28)), startTime: "07:00",
      source: "ADMIN_MANUAL", forceOverlap: true, overrideReason: "AUDIT",
    } as Parameters<typeof createAppointment>[0]);
    apptId = a.id; created.appts.push(a.id);
    return `total R$ ${Number(a.totalPrice)}`;
  });
  await check("iniciar e concluir", async () => {
    await transitionAppointmentStatus({ ctx, appointmentId: apptId, toStatus: "IN_PROGRESS" });
    await transitionAppointmentStatus({ ctx, appointmentId: apptId, toStatus: "COMPLETED" });
  });
  await check("estoque baixou ao concluir (12 → 10)", async () => {
    const p = await withAppContext(BOOT, (tx) => tx.product.findUniqueOrThrow({ where: { id: productId } }));
    return p.stock === 10 ? "10" : false;
  });
  await check("comissões geradas: serviço 50% e produto 15%", async () => {
    const e = await withAppContext(BOOT, (tx) => tx.commissionEntry.findMany({ where: { appointmentId: apptId } }));
    const svc = e.find((x) => x.type === "SERVICE");
    const prod = e.find((x) => x.type === "PRODUCT");
    if (!svc || !prod) return false;
    return `${svc.calculationFormula} = R$ ${Number(svc.calculatedAmount).toFixed(2)} | ${prod.calculationFormula} = R$ ${Number(prod.calculatedAmount).toFixed(2)}`;
  });
  await check("excluir o atendimento concluído devolve estoque e tira comissões", async () => {
    await cancelAppointment({ ctx, appointmentId: apptId, reason: "AUDIT" });
    const p = await withAppContext(BOOT, (tx) => tx.product.findUniqueOrThrow({ where: { id: productId } }));
    const e = await withAppContext(BOOT, (tx) => tx.commissionEntry.count({ where: { appointmentId: apptId } }));
    return p.stock === 12 && e === 0 ? "estoque 12, comissões 0" : false;
  });
  await check("bloquear horário na agenda e desbloquear", async () => {
    const b = await pros.createBlockedSlot({ ctx, professionalId: base.prof.id, date: new Date(Date.UTC(2026, 11, 28)), startTime: "12:00", endTime: "13:00", reason: "AUDIT almoço" });
    created.blocks.push(b.id);
    await pros.deleteBlockedSlot({ ctx, blockedSlotId: b.id });
    created.blocks.pop();
  });

  console.log("Planos de assinatura, cupons, promoções, clientes");
  await check("criar plano e editar preço", async () => {
    const p = await subs.createSubscriptionPlan({ ctx, name: "AUDIT Plano", priceMonthly: 99, creditLimitPerMonth: 4, serviceIds: [serviceId] });
    created.plans.push(p.id);
    const u = await subs.updateSubscriptionPlan({ ctx, planId: p.id, priceMonthly: 109 });
    return Number(u.priceMonthly) === 109;
  });
  await check("criar cupom, desativar e excluir", async () => {
    const c = await coupons.createCoupon({ ctx, code: `AUDIT${Date.now() % 100000}`, name: "AUDIT", discountType: "PERCENT", discountValue: 10, validFrom: new Date(), validUntil: new Date(Date.now() + 86_400_000 * 7), usageLimit: 1 });
    await coupons.updateCoupon({ ctx, couponId: c.id, status: "DISABLED" });
    await coupons.deleteCoupon({ ctx, couponId: c.id });
  });
  await check("criar promoção e excluir", async () => {
    const p = await promos.createPromotion({ ctx, name: "AUDIT promo", startDate: new Date(), endDate: new Date(Date.now() + 86_400_000), services: [{ serviceId, originalPrice: 60, promoPrice: 40 }] });
    await promos.deletePromotion({ ctx, promotionId: p.id });
  });
  await check("cadastrar cliente e editar", async () => {
    const c = await clients.createClient({ ctx, name: "AUDIT Cliente", phone: "11999990000" } as Parameters<typeof clients.createClient>[0]);
    created.clients.push(c.id);
    const u = await clients.updateClient({ ctx, clientId: c.id, notes: "editado" } as Parameters<typeof clients.updateClient>[0]);
    return u.notes === "editado";
  });

  // ---------- limpeza ----------
  await withAppContext(BOOT, async (tx) => {
    await tx.appointmentStatusLog.deleteMany({ where: { appointmentId: { in: created.appts } } });
    await tx.appointmentProduct.deleteMany({ where: { appointmentId: { in: created.appts } } });
    await tx.appointmentService.deleteMany({ where: { appointmentId: { in: created.appts } } });
    await tx.commissionEntry.deleteMany({ where: { appointmentId: { in: created.appts } } });
    await tx.activityLog.deleteMany({ where: { entityId: { in: created.appts } } });
    await tx.appointment.deleteMany({ where: { id: { in: created.appts } } });
    await tx.planService.deleteMany({ where: { planId: { in: created.plans } } });
    await tx.subscriptionPlan.deleteMany({ where: { id: { in: created.plans } } });
    await tx.client.deleteMany({ where: { id: { in: created.clients } } });
    await tx.product.deleteMany({ where: { id: { in: created.products } } });
    await tx.service.deleteMany({ where: { id: { in: created.services } } });
    await tx.serviceSection.deleteMany({ where: { id: { in: created.sections } } });
  });
  console.log(`\nResultado: ${ok} ok, ${fail} com problema. Dados de teste removidos.`);
}
main().catch((e) => console.error("ERRO GERAL:", e instanceof Error ? e.message.split("\n").filter(Boolean).pop() : e)).finally(() => prisma.$disconnect());
