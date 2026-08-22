/**
 * Processo standalone de automações — roda fora do processo do Next.js.
 *
 * Dev: `npm run jobs` (fica em foreground, agenda tudo via node-cron).
 * Fase 10 (produção): pg_cron + pg_net no Postgres do Supabase chamam
 * /api/jobs/{nome} em vez disso (ver deploy/pg_cron_setup.sql) — este
 * arquivo deixa de rodar em produção, mas continua útil pra dev local
 * sem precisar de um projeto Supabase configurado. A lógica em si (que
 * mora em server/services/jobs, não aqui) é a mesma nos dois caminhos.
 */
import "dotenv/config";
import cron from "node-cron";
import { prisma } from "../src/server/db/client";
import {
  generateRecurringAppointments,
  sweepNoShows,
  sendUpcomingReminders,
  runRetentionCouponGeneration,
  runCommissionApuracao,
} from "../src/server/services/jobs";

function log(job: string, result: unknown) {
  console.log(`[${new Date().toISOString()}] ${job}:`, JSON.stringify(result));
}

async function runSafely(job: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    log(job, result);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ${job} FALHOU:`, err);
  }
}

// A cada hora: varredura de no-show + lembretes (janela de horas, precisa de granularidade fina)
cron.schedule("0 * * * *", () => {
  void runSafely("noShowSweep", sweepNoShows);
  void runSafely("reminderScheduler", sendUpcomingReminders);
});

// Diário às 03:00: gerador de recorrência + cupons de retorno (nada urgente em minutos)
cron.schedule("0 3 * * *", () => {
  void runSafely("recurringSeriesGenerator", generateRecurringAppointments);
  void runSafely("retentionCouponGenerator", runRetentionCouponGeneration);
});

// 1º dia do mês às 04:00: apuração de comissões
cron.schedule("0 4 1 * *", () => {
  void runSafely("commissionApuracao", runCommissionApuracao);
});

console.log("Automações agendadas. Ctrl+C para parar.");

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
