-- Roda isto UMA VEZ no SQL Editor do painel Supabase (não é uma migration
-- do Prisma — pg_cron/pg_net são recursos do Postgres do Supabase, fora do
-- schema "public" que o Prisma controla). Troque SEU_DOMINIO e
-- SEU_JOBS_SECRET pelos valores reais antes de rodar, e NUNCA salve este
-- arquivo com os valores reais preenchidos no controle de versão.
--
-- Por que pg_cron chamando um endpoint HTTP em vez de virar Edge Function
-- de verdade: a lógica de cada automação já mora em
-- src/server/services/jobs/*.ts, testada e usando Prisma — Prisma Client
-- não roda em Deno/Edge Functions, então "virar Edge Function" seria
-- reescrever o acesso a dados do zero sem poder testar contra um projeto
-- real antes do deploy. pg_cron + pg_net chamando um endpoint HTTP do
-- próprio app é um padrão documentado do Supabase pra automações
-- complexas — reaproveita 100% da lógica já validada pela Fase 7/8.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- A cada hora: varredura de no-show + lembretes (janela de horas, precisa
-- de granularidade fina) — mesma cadência do scripts/run-jobs.ts local.
select cron.schedule(
  'no-show-sweep-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU_DOMINIO/api/jobs/no-show-sweep',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jobs-secret', 'SEU_JOBS_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'reminder-scheduler-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU_DOMINIO/api/jobs/reminder-scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jobs-secret', 'SEU_JOBS_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- Diário às 03:00 (horário do servidor Postgres, geralmente UTC no
-- Supabase — ajuste o horário do cron se quiser 03:00 no horário local):
-- gerador de recorrência + cupons de retorno.
select cron.schedule(
  'recurring-series-generator-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://SEU_DOMINIO/api/jobs/recurring-series-generator',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jobs-secret', 'SEU_JOBS_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'retention-coupon-generator-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://SEU_DOMINIO/api/jobs/retention-coupon-generator',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jobs-secret', 'SEU_JOBS_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- 1º dia do mês às 04:00: apuração de comissões.
select cron.schedule(
  'commission-apuracao-monthly',
  '0 4 1 * *',
  $$
  select net.http_post(
    url := 'https://SEU_DOMINIO/api/jobs/commission-apuracao',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jobs-secret', 'SEU_JOBS_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- Conferir o que está agendado:
-- select * from cron.job;
-- Ver histórico de execuções (sucesso/erro de cada chamada HTTP):
-- select * from cron.job_run_details order by start_time desc limit 20;
-- Cancelar um agendamento (se precisar refazer):
-- select cron.unschedule('nome-do-job');
