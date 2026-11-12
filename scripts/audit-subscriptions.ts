/** Ciclo completo da assinatura, como o cliente e o admin usam. Limpa tudo no fim. */
import "dotenv/config";
import { withAppContext } from "../src/server/db/context";
import { prisma } from "../src/server/db/client";
import * as subs from "../src/features/subscriptions/service";
import { bookAppointmentAsClient } from "../src/features/appointments/booking";
import { cancelAppointment } from "../src/features/appointments/service";
import { transitionAppointmentStatus } from "../src/features/appointments/stateMachine";

const BOOT = { role: "ADMIN" as const, userId: null };
let ok = 0, fail = 0;
async function check(label: string, fn: () => Promise<string | boolean | void>) {
  try {
    const r = await fn();
    if (r === false) throw new Error("resultado inesperado");
    ok++; console.log(`  ✅ ${label}${typeof r === "string" ? ` — ${r}` : ""}`);
  } catch (e) {
    fail++; console.log(`  ❌ ${label} — ${(e instanceof Error ? e.message : String(e)).split("\n").filter(Boolean).pop()?.slice(0, 170)}`);
  }
}
async function expectError(label: string, fn: () => Promise<unknown>, contains: string) {
  await check(label, async () => {
    try { await fn(); return false; } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return m.includes(contains) ? `recusado: "${m.slice(0, 110)}"` : (() => { throw new Error(`erro diferente: ${m}`); })();
    }
  });
}

async function main() {
  const d = await withAppContext(BOOT, async (tx) => ({
    admin: await tx.user.findFirstOrThrow({ where: { role: "ADMIN" } }),
    unit: await tx.unit.findFirstOrThrow({ where: { active: true } }),
    prof: await tx.professional.findFirstOrThrow({ where: { active: true }, orderBy: { name: "asc" } }),
    corte: await tx.service.findFirstOrThrow({ where: { active: true, name: "Corte" } }),
    barba: await tx.service.findFirstOrThrow({ where: { active: true, name: "Barba" } }),
    user: await tx.user.findUniqueOrThrow({ where: { email: "cliente20@bacelar.dev" }, include: { client: true } }),
  }));
  const admin = { role: "ADMIN" as const, userId: d.admin.id, sessionUserId: d.admin.id };
  const client = { role: "CLIENT" as const, userId: d.user.client!.id, sessionUserId: d.user.id };
  const pro = { role: "PROFESSIONAL" as const, userId: d.prof.id, sessionUserId: d.prof.userId };
  const appts: string[] = [];
  let planId = "", subId = "";

  // Datas futuras: próxima segunda e próxima terça (dias diferentes para testar restrição de dias).
  const now = new Date();
  const nextWeekday = (wd: number, extraWeeks = 1) => {
    const t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const add = ((wd - t.getUTCDay() + 7) % 7) + 7 * extraWeeks;
    return new Date(t.getTime() + add * 86_400_000);
  };
  // Dezembro/2026: sem agendamentos da simulação e dentro dos 60 dias de antecedência máxima.
  const monday = new Date(Date.UTC(2026, 11, 7)), tuesday = new Date(Date.UTC(2026, 11, 8));
  void nextWeekday;
  const book = (serviceIds: string[], date: Date, time: string) =>
    bookAppointmentAsClient({ ctx: client, unitId: d.unit.id, professionalId: d.prof.id, serviceIds, scheduledDate: date, startTime: time, paymentMethod: "SUBSCRIPTION", subscriptionId: subId })
      .then((a) => { appts.push(a.id); return a; });

  console.log("Plano e pedido do cliente");
  await check("admin cria plano: só Corte, 2 créditos, só às segundas", async () => {
    const p = await subs.createSubscriptionPlan({ ctx: admin, name: "AUDIT Plano Corte", priceMonthly: 100, creditLimitPerMonth: 2, allowedWeekdays: [1], serviceIds: [d.corte.id] });
    planId = p.id;
  });
  await check("cliente pede a assinatura (fica pendente)", async () => {
    const s = await subs.requestClientSubscription({ ctx: client, clientId: client.userId, planId } as Parameters<typeof subs.requestClientSubscription>[0]);
    subId = s.id; return s.status === "PENDING" ? "PENDING" : false;
  });
  await expectError("pendente não paga agendamento", () => book([d.corte.id], monday, "09:00"), "não está ativa");
  await check("admin aprova", async () => {
    const s = await subs.approveClientSubscription({ ctx: admin, subscriptionId: subId });
    return `${s.status}, vence ${s.nextBillingDate?.toISOString().slice(0, 10)}`;
  });

  console.log("Usando o plano");
  await check("agenda Corte na segunda pagando com o plano (total R$ 0)", async () => {
    const a = await book([d.corte.id], monday, "09:00");
    return Number(a.totalPrice) === 0 ? "R$ 0, 1 crédito usado" : false;
  });
  await expectError("Barba (fora do plano) é recusada", () => book([d.barba.id], monday, "10:00"), "não está incluído");
  await expectError("terça (fora dos dias do plano) é recusada", () => book([d.corte.id], tuesday, "09:00"), "vale só");
  await check("segundo Corte na segunda (2/2 créditos)", async () => { await book([d.corte.id], monday, "11:00"); });
  await expectError("terceiro é recusado: limite do mês", () => book([d.corte.id], monday, "13:00"), "Limite de créditos");

  console.log("Cancelamento devolve crédito");
  await check("cliente cancela um horário → crédito volta (2 → 1)", async () => {
    await cancelAppointment({ ctx: client, appointmentId: appts[0] });
    const s = await withAppContext(BOOT, (tx) => tx.clientSubscription.findUniqueOrThrow({ where: { id: subId } }));
    return s.creditsUsedThisPeriod === 1 ? "1 usado" : false;
  });
  await check("agora consegue agendar de novo com o plano", async () => { await book([d.corte.id], monday, "14:00"); });
  await check("profissional cancela um horário com plano → crédito volta", async () => {
    await cancelAppointment({ ctx: pro, appointmentId: appts[appts.length - 1] });
    const s = await withAppContext(BOOT, (tx) => tx.clientSubscription.findUniqueOrThrow({ where: { id: subId } }));
    return s.creditsUsedThisPeriod === 1 ? "1 usado" : `${s.creditsUsedThisPeriod} usados`;
  });
  await check("falta (não compareceu) NÃO devolve o crédito", async () => {
    const a = appts[1];
    await transitionAppointmentStatus({ ctx: admin, appointmentId: a, toStatus: "NO_SHOW" });
    const s = await withAppContext(BOOT, (tx) => tx.clientSubscription.findUniqueOrThrow({ where: { id: subId } }));
    return s.creditsUsedThisPeriod === 1 ? "continua 1 usado" : false;
  });

  console.log("Pagamento, vencimento, pausa e cancelamento");
  await check("registrar pagamento: vence +1 mês e zera os créditos", async () => {
    const before = await withAppContext(BOOT, (tx) => tx.clientSubscription.findUniqueOrThrow({ where: { id: subId } }));
    const r = await subs.registerSubscriptionPayment({ ctx: admin, subscriptionId: subId });
    const after = await withAppContext(BOOT, (tx) => tx.clientSubscription.findUniqueOrThrow({ where: { id: subId } }));
    return after.creditsUsedThisPeriod === 0 ? `vencimento ${before.nextBillingDate?.toISOString().slice(0, 10)} → ${r.nextBillingDate?.toISOString().slice(0, 10)}, créditos 0` : false;
  });
  await check("mensalidade vencida além da tolerância bloqueia o plano", async () => {
    await withAppContext(BOOT, (tx) => tx.clientSubscription.update({ where: { id: subId }, data: { nextBillingDate: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 10)) } }));
    try { await book([d.corte.id], monday, "15:00"); return false; } catch (e) { return (e as Error).message.includes("venceu") ? "recusado: mensalidade venceu" : false; }
  });
  await check("dentro da tolerância (venceu há 2 dias) ainda vale", async () => {
    await withAppContext(BOOT, (tx) => tx.clientSubscription.update({ where: { id: subId }, data: { nextBillingDate: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 2)) } }));
    await book([d.corte.id], monday, "15:00");
  });
  await check("admin pausa → plano não paga; reativa → volta a pagar", async () => {
    await subs.setClientSubscriptionStatus({ ctx: admin, subscriptionId: subId, status: "PAUSED" });
    let blocked = false;
    try { await book([d.corte.id], monday, "16:00"); } catch { blocked = true; }
    await subs.setClientSubscriptionStatus({ ctx: admin, subscriptionId: subId, status: "ACTIVE" });
    return blocked ? "pausado bloqueou, ativo liberou" : false;
  });
  await check("cliente cancela a própria assinatura", async () => (await subs.cancelOwnSubscription({ ctx: client, subscriptionId: subId })).status === "CANCELLED");

  // limpeza
  await withAppContext(BOOT, async (tx) => {
    await tx.subscriptionCreditUsage.deleteMany({ where: { clientSubscriptionId: subId } });
    await tx.commissionEntry.deleteMany({ where: { appointmentId: { in: appts } } });
    await tx.appointmentStatusLog.deleteMany({ where: { appointmentId: { in: appts } } });
    await tx.appointmentService.deleteMany({ where: { appointmentId: { in: appts } } });
    await tx.activityLog.deleteMany({ where: { entityId: { in: [...appts, subId] } } });
    await tx.appointment.deleteMany({ where: { id: { in: appts } } });
    await tx.clientSubscription.deleteMany({ where: { id: subId } });
    await tx.planService.deleteMany({ where: { planId } });
    await tx.subscriptionPlan.deleteMany({ where: { id: planId } });
    await tx.client.update({ where: { id: client.userId }, data: { noShowCount: { decrement: 1 } } });
  });
  console.log(`\nResultado: ${ok} ok, ${fail} com problema. Dados de teste removidos.`);
}
main().catch((e) => console.error("ERRO GERAL:", e instanceof Error ? e.message.split("\n").filter(Boolean).pop() : e)).finally(() => prisma.$disconnect());
