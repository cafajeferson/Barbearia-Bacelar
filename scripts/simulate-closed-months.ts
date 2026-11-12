/**
 * Simula meses JÁ FECHADOS da barbearia, para o dono ver o sistema "rodando":
 * todos os atendimentos com resultado final (concluído / faltou / cancelado),
 * produtos pedidos e baixados do estoque, assinantes de vários planos com as
 * mensalidades pagas, comissões apuradas e pagas. O mês atual fica zerado.
 *
 *   npx tsx --require ./scripts/react-cache-shim.cjs scripts/simulate-closed-months.ts \
 *       <arquivo-backup.json> 2026-09 2026-10
 *
 * Antes de simular, salva no backup e APAGA: todos os agendamentos (de qualquer
 * mês), todas as comissões, as assinaturas dos clientes de teste ("Cliente N")
 * com os pagamentos registrados delas e as notificações desses clientes.
 * Assinaturas de outras pessoas não são tocadas.
 *
 * Tudo que é criado leva a marca SIMULACAO (nota do agendamento / metadata),
 * então `scripts/simulate-month.ts remover-simulacao` também remove.
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

// Semente fixa: rodar de novo gera a mesma simulação.
let seed = 20260901;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;

// Estoque que cada produto deve ter no fim da simulação (o resto é a entrada
// de mercadoria que "chegou" no começo de setembro). Um fica abaixo do alerta.
const FINAL_STOCK: Record<string, number> = { gel: 14, pomada: 3, pente: 22 };

/** Quantos clientes de teste assinam cada plano (do mais barato ao mais caro). */
const SUBSCRIBERS_PER_PLAN = 3;

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

async function cleanup(backupFile: string, testClientIds: string[]) {
  const data = await withAppContext(SYSTEM, async (tx) => {
    const appointments = await tx.appointment.findMany();
    const ids = appointments.map((a) => a.id);
    const subscriptions = await tx.clientSubscription.findMany({ where: { clientId: { in: testClientIds } } });
    const subIds = subscriptions.map((s) => s.id);
    return {
      takenAt: new Date().toISOString(),
      appointments,
      appointmentServices: await tx.appointmentService.findMany({ where: { appointmentId: { in: ids } } }),
      appointmentProducts: await tx.appointmentProduct.findMany({ where: { appointmentId: { in: ids } } }),
      statusLogs: await tx.appointmentStatusLog.findMany({ where: { appointmentId: { in: ids } } }),
      creditUsages: await tx.subscriptionCreditUsage.findMany(),
      couponRedemptions: await tx.couponRedemption.findMany({ where: { appointmentId: { in: ids } } }),
      commissionEntries: await tx.commissionEntry.findMany(),
      activityLogs: await tx.activityLog.findMany({
        where: { OR: [{ entityType: "Appointment", entityId: { in: ids } }, { entityId: { in: subIds } }] },
      }),
      subscriptions,
      notifications: await tx.notificationLog.findMany({ where: { clientId: { in: testClientIds } } }),
      products: await tx.product.findMany(),
      clients: await tx.client.findMany(),
    };
  });
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(
    `backup: ${backupFile} (${data.appointments.length} agendamentos, ${data.commissionEntries.length} comissões, ${data.subscriptions.length} assinaturas)`,
  );

  await deleteAppointments(data.appointments.map((a) => a.id));
  await withAppContext(SYSTEM, async (tx) => {
    await tx.commissionEntry.deleteMany({});
    const subIds = data.subscriptions.map((s) => s.id);
    await tx.activityLog.deleteMany({ where: { entityId: { in: subIds } } });
    await tx.subscriptionCreditUsage.deleteMany({ where: { clientSubscriptionId: { in: subIds } } });
    await tx.clientSubscription.deleteMany({ where: { id: { in: subIds } } });
    await tx.notificationLog.deleteMany({ where: { clientId: { in: testClientIds } } });
    await tx.client.updateMany({ where: { id: { in: testClientIds } }, data: { blocked: false } });
    // Todos os agendamentos foram apagados: as faltas contadas antes não existem mais.
    await tx.client.updateMany({ data: { noShowCount: 0 } });
  });
  console.log("limpeza feita: nenhum agendamento nem comissão no banco");
}

async function main() {
  const [backupFile, ...months] = process.argv.slice(2);
  if (!backupFile || months.length === 0 || !months.every((m) => /^\d{4}-\d{2}$/.test(m))) {
    console.log("uso: simulate-closed-months.ts <backup.json> AAAA-MM [AAAA-MM ...]");
    process.exitCode = 1;
    return;
  }
  months.sort();
  const now = new Date();
  for (const m of months) {
    const [y, mo] = m.split("-").map(Number);
    if (new Date(y, mo, 1).getTime() > now.getTime()) throw new Error(`${m} ainda não acabou: só dá para simular mês fechado.`);
  }

  const base = await withAppContext(SYSTEM, async (tx) => ({
    admin: await tx.user.findFirstOrThrow({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }),
    unit: await tx.unit.findFirstOrThrow({ where: { active: true } }),
    pros: await tx.professional.findMany({
      where: { active: true },
      include: { weeklyAvailability: { where: { active: true } } },
      orderBy: { name: "asc" },
    }),
    services: await tx.service.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    products: await tx.product.findMany({ where: { active: true } }),
    plans: await tx.subscriptionPlan.findMany({
      where: { active: true },
      include: { services: true },
      orderBy: { priceMonthly: "asc" },
    }),
    clients: await tx.client.findMany({ where: { name: { startsWith: "Cliente " } } }),
  }));
  const clients = base.clients
    .filter((c) => /^Cliente \d+$/.test(c.name))
    .sort((a, b) => Number(a.name.split(" ")[1]) - Number(b.name.split(" ")[1]));
  if (clients.length < 30) throw new Error("Poucos 'Cliente N' — rode scripts/seed-test-clients.ts antes.");
  const admin = { role: "ADMIN" as const, userId: base.admin.id, sessionUserId: base.admin.id };

  await cleanup(backupFile, clients.map((c) => c.id));

  // Serviços do dia a dia saem bem mais que os raros.
  const common = base.services.filter((s) => /^(corte|barba|corte \+|pezinho|sobrancelha)/i.test(s.name) && s.durationMinutes <= 60);
  const pool = common.length >= 3 ? common : base.services.filter((s) => s.durationMinutes <= 60);
  const rare = base.services.filter((s) => !pool.includes(s) && s.durationMinutes <= 90);
  const serviceById = new Map(base.services.map((s) => [s.id, s]));

  // --- Assinantes: N clientes por plano, espalhados entre os 50 ---
  const first = months[0].split("-").map(Number);
  const last = months[months.length - 1].split("-").map(Number);
  type Sub = {
    id: string;
    clientId: string;
    planName: string;
    price: number;
    serviceIds: string[];
    weekdays: number[];
    payDay: number;
    usedByMonth: Map<string, number>;
    usedSinceLastPayment: number;
  };
  const subs = new Map<string, Sub>();
  let k = 0;
  for (const plan of base.plans) {
    const covered = plan.services.map((ps) => ps.serviceId).filter((id) => serviceById.has(id));
    if (covered.length === 0) continue;
    for (let j = 0; j < SUBSCRIBERS_PER_PLAN; j++) {
      const client = clients[(3 + k * 7) % clients.length];
      k++;
      if (subs.has(client.id)) continue;
      const payDay = 1 + ((k * 5) % 26); // vencimentos do dia 1 ao 26
      // Mensalidade do último mês simulado vence no mês seguinte (o mês do teste).
      const nextBilling = new Date(Date.UTC(last[0], last[1], payDay));
      const created = await withAppContext(SYSTEM, async (tx) => {
        const sub = await tx.clientSubscription.create({
          data: {
            clientId: client.id,
            planId: plan.id,
            status: "ACTIVE",
            createdAt: new Date(first[0], first[1] - 1, payDay, 9),
            startDate: new Date(first[0], first[1] - 1, payDay, 10),
            approvedAt: new Date(first[0], first[1] - 1, payDay, 10),
            approvedBy: base.admin.id,
            nextBillingDate: nextBilling,
          },
        });
        // Uma mensalidade paga em cada mês simulado.
        for (const m of months) {
          const [y, mo] = m.split("-").map(Number);
          await tx.activityLog.create({
            data: {
              actorUserId: base.admin.id,
              action: SUBSCRIPTION_PAYMENT_ACTION,
              entityType: "ClientSubscription",
              entityId: sub.id,
              metadata: { amount: Number(plan.priceMonthly), planName: plan.name, clientName: client.name, tag: TAG },
              createdAt: new Date(y, mo - 1, payDay, 11),
            },
          });
        }
        return sub;
      });
      subs.set(client.id, {
        id: created.id,
        clientId: client.id,
        planName: plan.name,
        price: Number(plan.priceMonthly),
        serviceIds: covered,
        weekdays: plan.allowedWeekdays,
        payDay,
        usedByMonth: new Map(),
        usedSinceLastPayment: 0,
      });
    }
  }

  const noShows = new Map<string, number>();
  const unitsSold = new Map<string, number>();
  const summary: Record<string, Record<string, number>> = {};

  for (const month of months) {
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const counts: Record<string, number> = {};
    summary[month] = counts;
    const isLastMonth = month === months[months.length - 1];

    for (let day = 1; day <= daysInMonth; day++) {
      const weekday = new Date(year, mon - 1, day).getDay();
      const scheduledDate = new Date(Date.UTC(year, mon - 1, day));
      // Sábado e sexta mais cheios; começo de semana mais vazio.
      const vacancy = weekday === 6 ? 0.08 : weekday === 5 ? 0.12 : weekday <= 2 ? 0.28 : 0.2;
      for (const pro of base.pros) {
        for (const w of pro.weeklyAvailability.filter((x) => x.weekday === weekday)) {
          let cursor = timeToMinutes(w.startTime) + Math.floor(rnd() * 2) * 15;
          const end = timeToMinutes(w.endTime);
          while (true) {
            if (chance(vacancy)) {
              cursor += 15 * (1 + Math.floor(rnd() * 3)); // horário vago
              if (cursor >= end) break;
              continue;
            }
            const client = pick(clients);
            const sub = subs.get(client.id);
            const source = chance(0.14) ? "WALK_IN" : chance(0.65) ? "APP" : "ADMIN_MANUAL";
            const monthUse = sub?.usedByMonth.get(month) ?? 0;
            const planOk =
              sub &&
              source !== "WALK_IN" &&
              (sub.weekdays.length === 0 || sub.weekdays.includes(weekday)) &&
              monthUse < 14 &&
              chance(0.85);
            const services = planOk
              ? [serviceById.get(pick(sub.serviceIds))!]
              : chance(0.12) && rare.length
                ? [pick(rare)]
                : [pick(pool)];
            const duration = services.reduce((s, x) => s + x.durationMinutes, 0);
            if (cursor + duration > end) break;

            const r = rnd();
            const status = r < 0.05 ? "NO_SHOW" : r < 0.11 ? "CANCELLED" : "COMPLETED";
            // Ninguém passa de 2 faltas: com 3 a regra bloqueia o agendamento online.
            const finalStatus = status === "NO_SHOW" && (noShows.get(client.id) ?? 0) >= 2 ? "COMPLETED" : status;
            const paidWithPlan = planOk && finalStatus !== "CANCELLED";
            const products =
              base.products.length && chance(paidWithPlan ? 0.12 : 0.2)
                ? (() => {
                    const p1 = pick(base.products);
                    const list = [{ productId: p1.id, quantity: chance(0.2) ? 2 : 1 }];
                    if (chance(0.15)) {
                      const p2 = pick(base.products);
                      if (p2.id !== p1.id) list.push({ productId: p2.id, quantity: 1 });
                    }
                    return list;
                  })()
                : undefined;

            const startTime = addMinutesToTime("00:00", cursor);
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

            const at = new Date(year, mon - 1, day, Math.floor(cursor / 60), cursor % 60);
            const bookedAt = new Date(at.getTime() - (source === "WALK_IN" ? 10 * 60_000 : (1 + Math.floor(rnd() * 6)) * 86_400_000));
            const doneAt = new Date(at.getTime() + duration * 60_000);
            await withAppContext(SYSTEM, async (tx) => {
              await tx.appointment.update({
                where: { id: appt.id },
                data: {
                  status: finalStatus,
                  createdAt: bookedAt,
                  ...(finalStatus === "CANCELLED"
                    ? { cancelledAt: new Date(Math.max(bookedAt.getTime() + 3_600_000, at.getTime() - 20 * 3_600_000)), cancelledBy: base.admin.id }
                    : {}),
                  ...(paidWithPlan ? { totalPrice: 0 } : {}),
                },
              });
              await tx.activityLog.updateMany({ where: { entityType: "Appointment", entityId: appt.id }, data: { createdAt: bookedAt } });
              await tx.$executeRaw`
                INSERT INTO "AppointmentStatusLog" (id, "appointmentId", "fromStatus", "toStatus", "changedBy", "isOverride", "reason", "createdAt")
                VALUES (gen_random_uuid()::text, ${appt.id}::text, 'SCHEDULED'::"AppointmentStatus", ${finalStatus}::"AppointmentStatus", ${base.admin.id}::text, false, ${TAG}, ${finalStatus === "COMPLETED" ? doneAt : at})
              `;
              if (finalStatus === "NO_SHOW") {
                await tx.client.update({ where: { id: client.id }, data: { noShowCount: { increment: 1 } } });
              }
              if (paidWithPlan && sub) {
                await tx.subscriptionCreditUsage.create({
                  data: { clientSubscriptionId: sub.id, appointmentId: appt.id, creditsUsed: 1, createdAt: bookedAt },
                });
              }
            });
            if (finalStatus === "NO_SHOW") noShows.set(client.id, (noShows.get(client.id) ?? 0) + 1);
            if (paidWithPlan && sub) {
              sub.usedByMonth.set(month, monthUse + 1);
              // Crédito do período atual = usos desde o último pagamento (dia de vencimento no último mês).
              if (isLastMonth && day >= sub.payDay) sub.usedSinceLastPayment++;
              counts["PAGO_COM_PLANO"] = (counts["PAGO_COM_PLANO"] ?? 0) + 1;
            }
            if (finalStatus === "COMPLETED" && products) {
              for (const p of products) unitsSold.set(p.productId, (unitsSold.get(p.productId) ?? 0) + p.quantity);
              counts["COM_PRODUTO"] = (counts["COM_PRODUTO"] ?? 0) + 1;
            }
            counts[finalStatus] = (counts[finalStatus] ?? 0) + 1;
            if (source === "WALK_IN") counts["ENCAIXE"] = (counts["ENCAIXE"] ?? 0) + 1;
            counts["TOTAL"] = (counts["TOTAL"] ?? 0) + 1;
            cursor += duration;
          }
        }
      }
      if (day % 10 === 0) console.log(`  ${month} dia ${day}: ${counts["TOTAL"] ?? 0} agendamentos`);
    }

    // Mês fechado: comissões apuradas e todas pagas no dia 5 do mês seguinte.
    const periodMonth = new Date(year, mon - 1, 1);
    const result = await recalculateCommissions({ ctx: admin, periodMonth });
    const paid = await withAppContext(SYSTEM, (tx) =>
      tx.commissionEntry.updateMany({
        where: { periodMonth: new Date(Date.UTC(year, mon - 1, 1)) },
        data: { status: "PAID", paidAt: new Date(year, mon, 5, 18) },
      }),
    );
    console.log(`${month}:`, counts, `| comissões: ${result.appointmentsProcessed} atend., ${result.subscriptionAttendances} via plano, ${paid.count} lançamentos pagos`);
  }

  // Créditos do período em andamento e estoque final.
  await withAppContext(SYSTEM, async (tx) => {
    for (const s of Array.from(subs.values())) {
      await tx.clientSubscription.update({ where: { id: s.id }, data: { creditsUsedThisPeriod: s.usedSinceLastPayment } });
    }
    for (const p of base.products) {
      const target = FINAL_STOCK[p.name.trim().toLowerCase()] ?? 10;
      await tx.product.update({ where: { id: p.id }, data: { stock: target } });
    }
  });

  console.log("\nassinantes:");
  for (const s of Array.from(subs.values())) {
    const name = clients.find((c) => c.id === s.clientId)!.name;
    console.log(`  ${name}: ${s.planName} (R$ ${s.price}) vence dia ${s.payDay} — usos ${months.map((m) => s.usedByMonth.get(m) ?? 0).join("/")}`);
  }
  console.log("\nprodutos vendidos (unidades):");
  for (const p of base.products) {
    const sold = unitsSold.get(p.id) ?? 0;
    const target = FINAL_STOCK[p.name.trim().toLowerCase()] ?? 10;
    console.log(`  ${p.name}: ${sold} vendidos, entrada de ${sold + target} em setembro, estoque final ${target}`);
  }
}

main()
  .catch((e) => {
    console.error("ERRO:", e instanceof Error ? e.message.split("\n").filter(Boolean).pop() : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
