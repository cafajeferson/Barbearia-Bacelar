/**
 * Simula um mês de trabalho da barbearia com os clientes de teste
 * ("Cliente 1" ... "Cliente 50"), para testar telas e relatórios com
 * volume: agendamentos com serviços variados, encaixes, produtos pedidos,
 * faltas, cancelamentos, assinantes pagando com o plano, pagamentos de
 * mensalidade registrados e comissões apuradas (parte já paga).
 *
 *   npx tsx scripts/simulate-month.ts limpar <arquivo-backup.json>
 *       -> salva TODOS os agendamentos atuais (e dados ligados a eles) no
 *          arquivo e depois apaga do banco.
 *   npx tsx scripts/simulate-month.ts simular 2026-10
 *   npx tsx scripts/simulate-month.ts remover-simulacao
 *
 * Tudo que a simulação cria leva a marca SIMULACAO (nota do agendamento /
 * metadata), para poder ser removido depois.
 */
import "dotenv/config";
import fs from "node:fs";
import { withAppContext } from "../src/server/db/context";
import { prisma } from "../src/server/db/client";
import { createAppointment } from "../src/features/appointments/service";
import { recalculateCommissions } from "../src/features/commissions/service";
import { SUBSCRIPTION_PAYMENT_ACTION } from "../src/features/subscriptions/service";
import { addMinutesToTime, timeToMinutes } from "../src/shared/lib/time";

const SYSTEM = { role: "ADMIN" as const, userId: null };
const TAG = "SIMULACAO";

// Gerador pseudoaleatório com semente fixa: a mesma simulação sempre sai igual.
let seed = 20261007;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;

async function deleteAppointments(ids: string[]) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    await withAppContext(SYSTEM, async (tx) => {
      await tx.commissionEntry.deleteMany({ where: { appointmentId: { in: chunk } } });
      await tx.subscriptionCreditUsage.deleteMany({ where: { appointmentId: { in: chunk } } });
      await tx.couponRedemption.deleteMany({ where: { appointmentId: { in: chunk } } });
      await tx.appointmentProduct.deleteMany({ where: { appointmentId: { in: chunk } } });
      await tx.appointmentService.deleteMany({ where: { appointmentId: { in: chunk } } });
      await tx.appointmentStatusLog.deleteMany({ where: { appointmentId: { in: chunk } } });
      await tx.activityLog.deleteMany({ where: { entityType: "Appointment", entityId: { in: chunk } } });
      await tx.appointment.deleteMany({ where: { id: { in: chunk } } });
    });
  }
}

/** Backup completo dos agendamentos e de tudo ligado a eles, depois apaga. */
async function limpar(backupFile: string) {
  const data = await withAppContext(SYSTEM, async (tx) => {
    const appointments = await tx.appointment.findMany();
    const ids = appointments.map((a) => a.id);
    return {
      takenAt: new Date().toISOString(),
      appointments,
      appointmentServices: await tx.appointmentService.findMany({ where: { appointmentId: { in: ids } } }),
      appointmentProducts: await tx.appointmentProduct.findMany({ where: { appointmentId: { in: ids } } }),
      statusLogs: await tx.appointmentStatusLog.findMany({ where: { appointmentId: { in: ids } } }),
      creditUsages: await tx.subscriptionCreditUsage.findMany({ where: { appointmentId: { in: ids } } }),
      couponRedemptions: await tx.couponRedemption.findMany({ where: { appointmentId: { in: ids } } }),
      commissionEntries: await tx.commissionEntry.findMany(),
      activityLogs: await tx.activityLog.findMany({ where: { entityType: "Appointment", entityId: { in: ids } } }),
    };
  });
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`backup salvo: ${backupFile} (${data.appointments.length} agendamentos, ${data.commissionEntries.length} comissões)`);

  await deleteAppointments(data.appointments.map((a) => a.id));
  // Comissões sem agendamento (rateio de assinatura) também eram de teste.
  await withAppContext(SYSTEM, (tx) => tx.commissionEntry.deleteMany({}));
  const left = await withAppContext(SYSTEM, (tx) => tx.appointment.count());
  console.log(`apagados. agendamentos restantes no banco: ${left}`);
}

async function simular(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(year, mon - 1, 1);
  const daysInMonth = new Date(year, mon, 0).getDate();

  const base = await withAppContext(SYSTEM, async (tx) => ({
    admin: await tx.user.findFirstOrThrow({ where: { role: "ADMIN" } }),
    unit: await tx.unit.findFirstOrThrow({ where: { active: true } }),
    pros: await tx.professional.findMany({
      where: { active: true },
      include: { weeklyAvailability: { where: { active: true } } },
      orderBy: { name: "asc" },
    }),
    services: await tx.service.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    products: await tx.product.findMany({ where: { active: true } }),
    plans: await tx.subscriptionPlan.findMany({ where: { active: true } }),
    clients: await tx.client.findMany({ where: { name: { startsWith: "Cliente " } } }),
  }));
  const clients = base.clients.filter((c) => /^Cliente \d+$/.test(c.name));
  if (clients.length === 0) throw new Error("Nenhum 'Cliente N' encontrado — rode scripts/seed-test-clients.ts antes.");
  const admin = { role: "ADMIN" as const, userId: base.admin.id, sessionUserId: base.admin.id };

  // Serviços "do dia a dia" aparecem bem mais que os raros.
  const common = base.services.filter((s) => /^(corte|barba|corte \+|pezinho|sobrancelha)/i.test(s.name) && s.durationMinutes <= 60);
  const pool = common.length >= 3 ? common : base.services.filter((s) => s.durationMinutes <= 60);
  const rare = base.services.filter((s) => !pool.includes(s) && s.durationMinutes <= 90);

  // --- assinantes: 8 clientes com plano ativo, mensalidade paga no mês ---
  const subscribers = clients.slice(0, 8);
  const subOf = new Map<string, { id: string; planId: string }>();
  for (let i = 0; i < subscribers.length; i++) {
    const client = subscribers[i];
    const plan = pick(base.plans);
    const payDay = 1 + (i % 5);
    // Vencimentos espalhados no começo do mês seguinte: alguns já vencidos.
    const nextBilling = new Date(Date.UTC(year, mon, payDay + (i % 2) * 6));
    const sub = await withAppContext(SYSTEM, async (tx) => {
      const created = await tx.clientSubscription.create({
        data: {
          clientId: client.id,
          planId: plan.id,
          status: "ACTIVE",
          startDate: new Date(year, mon - 1, payDay, 10),
          approvedAt: new Date(year, mon - 1, payDay, 10),
          approvedBy: base.admin.id,
          nextBillingDate: nextBilling,
        },
      });
      await tx.activityLog.create({
        data: {
          actorUserId: base.admin.id,
          action: SUBSCRIPTION_PAYMENT_ACTION,
          entityType: "ClientSubscription",
          entityId: created.id,
          metadata: { amount: Number(plan.priceMonthly), planName: plan.name, clientName: client.name, tag: TAG },
          createdAt: new Date(year, mon - 1, payDay, 11),
        },
      });
      return created;
    });
    subOf.set(client.id, { id: sub.id, planId: plan.id });
  }

  let total = 0;
  const counts: Record<string, number> = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, mon - 1, day);
    const weekday = date.getDay();
    const scheduledDate = new Date(Date.UTC(year, mon - 1, day));
    for (const pro of base.pros) {
      const windows = pro.weeklyAvailability.filter((w) => w.weekday === weekday);
      for (const w of windows) {
        let cursor = timeToMinutes(w.startTime) + Math.floor(rnd() * 3) * 15;
        const end = timeToMinutes(w.endTime);
        while (true) {
          const services = chance(0.12) && rare.length ? [pick(rare)] : [pick(pool)];
          const duration = services.reduce((s, x) => s + x.durationMinutes, 0);
          if (cursor + duration > end) break;
          if (chance(0.25)) {
            cursor += 15 * (1 + Math.floor(rnd() * 3)); // horário vago
            continue;
          }
          const client = pick(clients);
          const startTime = addMinutesToTime("00:00", cursor);
          const source = chance(0.15) ? "WALK_IN" : chance(0.6) ? "APP" : "ADMIN_MANUAL";
          const products = chance(0.1) && base.products.length ? [{ productId: pick(base.products).id, quantity: 1 }] : undefined;
          const appt = await createAppointment({
            ctx: admin,
            unitId: base.unit.id,
            professionalId: pro.id,
            clientId: client.id,
            serviceIds: services.map((s) => s.id),
            products,
            scheduledDate,
            startTime,
            source,
            notes: TAG,
          } as Parameters<typeof createAppointment>[0]);

          // Resultado do atendimento.
          const lastDays = day > daysInMonth - 2;
          const r = rnd();
          const status = lastDays && r < 0.08 ? "IN_PROGRESS" : r < 0.07 ? "NO_SHOW" : r < 0.13 ? "CANCELLED" : "COMPLETED";
          const sub = subOf.get(client.id);
          const paidWithPlan = status === "COMPLETED" && sub && source !== "WALK_IN" && chance(0.7);
          const at = new Date(year, mon - 1, day, Math.floor(cursor / 60), cursor % 60);
          await withAppContext(SYSTEM, async (tx) => {
            await tx.appointment.update({
              where: { id: appt.id },
              data: {
                status,
                createdAt: new Date(at.getTime() - 3 * 86_400_000),
                ...(status === "CANCELLED" ? { cancelledAt: new Date(at.getTime() - 86_400_000), cancelledBy: base.admin.id } : {}),
                ...(paidWithPlan ? { totalPrice: 0 } : {}),
              },
            });
            {
              await tx.$executeRaw`
                INSERT INTO "AppointmentStatusLog" (id, "appointmentId", "fromStatus", "toStatus", "changedBy", "isOverride", "reason", "createdAt")
                VALUES (gen_random_uuid()::text, ${appt.id}::text, 'SCHEDULED'::"AppointmentStatus", ${status}::"AppointmentStatus", ${base.admin.id}::text, false, ${TAG}, ${at})
              `;
            }
            if (status === "NO_SHOW") {
              await tx.client.update({ where: { id: client.id }, data: { noShowCount: { increment: 1 } } });
            }
            if (paidWithPlan && sub) {
              await tx.subscriptionCreditUsage.create({
                data: { clientSubscriptionId: sub.id, appointmentId: appt.id, creditsUsed: 1, createdAt: at },
              });
              await tx.clientSubscription.update({ where: { id: sub.id }, data: { creditsUsedThisPeriod: { increment: 1 } } });
            }
          });
          counts[status] = (counts[status] ?? 0) + 1;
          if (paidWithPlan) counts["PAGO_COM_PLANO"] = (counts["PAGO_COM_PLANO"] ?? 0) + 1;
          if (source === "WALK_IN") counts["ENCAIXE"] = (counts["ENCAIXE"] ?? 0) + 1;
          if (products) counts["COM_PRODUTO"] = (counts["COM_PRODUTO"] ?? 0) + 1;
          total++;
          cursor += duration;
        }
      }
    }
    if (day % 5 === 0) console.log(`  dia ${day}: ${total} agendamentos até agora`);
  }

  // Apuração do mês (serviço + rateio de assinatura) e pagamento de parte.
  const result = await recalculateCommissions({ ctx: admin, periodMonth: monthStart });
  const firstPro = base.pros[0];
  const paid = await withAppContext(SYSTEM, (tx) =>
    tx.commissionEntry.updateMany({
      where: { periodMonth: monthStart, professionalId: firstPro.id },
      data: { status: "PAID", paidAt: new Date(year, mon, 5, 18) },
    }),
  );
  console.log(`\nsimulação de ${month}: ${total} agendamentos`, counts);
  console.log(`comissões apuradas: ${result.appointmentsProcessed} atendimentos, ${result.subscriptionAttendances} via plano`);
  console.log(`comissões de ${firstPro.name} marcadas como pagas: ${paid.count} lançamentos; demais profissionais ficam a pagar`);
  console.log(`assinantes: ${subscribers.map((c) => c.name).join(", ")}`);
}

async function removerSimulacao() {
  const ids = await withAppContext(SYSTEM, async (tx) =>
    (await tx.appointment.findMany({ where: { notes: TAG }, select: { id: true } })).map((a) => a.id),
  );
  await deleteAppointments(ids);
  const subs = await withAppContext(SYSTEM, async (tx) => {
    const logs = await tx.activityLog.findMany({ where: { action: SUBSCRIPTION_PAYMENT_ACTION } });
    const simulated = logs.filter((l) => (l.metadata as { tag?: string } | null)?.tag === TAG);
    const subIds = simulated.map((l) => l.entityId);
    await tx.activityLog.deleteMany({ where: { id: { in: simulated.map((l) => l.id) } } });
    await tx.clientSubscription.deleteMany({ where: { id: { in: subIds } } });
    return subIds.length;
  });
  console.log(`removidos: ${ids.length} agendamentos e ${subs} assinaturas da simulação (comissões do mês: rode Recalcular)`);
}

async function main() {
  const [mode, arg] = process.argv.slice(2);
  if (mode === "limpar" && arg) return limpar(arg);
  if (mode === "simular" && /^\d{4}-\d{2}$/.test(arg ?? "")) return simular(arg!);
  if (mode === "remover-simulacao") return removerSimulacao();
  console.log("uso: limpar <backup.json> | simular AAAA-MM | remover-simulacao");
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("ERRO:", e instanceof Error ? e.message.split("\n").filter(Boolean).pop() : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
