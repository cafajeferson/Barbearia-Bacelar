import { NextResponse, type NextRequest } from "next/server";
import * as jobs from "@/server/services/jobs";

/**
 * Endpoint interno pras automações agendadas (Fase 10: chamado por
 * pg_cron + pg_net a partir do Postgres do Supabase — ver
 * deploy/pg_cron_setup.sql). Decidimos reaproveitar a lógica já testada em
 * server/services/jobs (Node/Prisma) atrás de uma rota protegida por
 * segredo compartilhado, em vez de reescrever tudo em Deno pra virar
 * Edge Function de verdade — Prisma Client não roda em Edge
 * Functions/Deno, então portar significaria reescrever o acesso a dados
 * do zero, sem conseguir testar contra um projeto real antes do deploy.
 * pg_cron chamando um endpoint HTTP é um padrão documentado e comum do
 * próprio Supabase pra exatamente este caso.
 *
 * Nunca exponha isto sem o header — qualquer um que descobrisse a URL
 * poderia disparar as automações à vontade (spam de lembretes, no-show
 * indevido, etc.).
 */
const JOB_MAP: Record<string, () => Promise<unknown>> = {
  "recurring-series-generator": jobs.generateRecurringAppointments,
  "no-show-sweep": jobs.sweepNoShows,
  "reminder-scheduler": jobs.sendUpcomingReminders,
  "retention-coupon-generator": jobs.runRetentionCouponGeneration,
  "commission-apuracao": jobs.runCommissionApuracao,
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobName: string }> }) {
  const secret = process.env.JOBS_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JOBS_SECRET não configurado no servidor." }, { status: 500 });
  }
  if (request.headers.get("x-jobs-secret") !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { jobName } = await params;
  const job = JOB_MAP[jobName];
  if (!job) {
    return NextResponse.json({ error: `Job desconhecido: ${jobName}` }, { status: 404 });
  }

  try {
    const result = await job();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido." },
      { status: 500 },
    );
  }
}
