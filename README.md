# Barbearia Bacelar

Sistema de agendamento white-label da Barbearia Bacelar — Next.js 14 (App Router) + TypeScript + Prisma 7 + PostgreSQL, com Row Level Security real desde o dia 1.

## Setup local (dev)

1. PostgreSQL 16 rodando localmente (nativo, sem Docker — ver `D:\PostgreSQL` neste ambiente).
2. Crie o papel não-superusuário que o app usa em runtime (RLS se aplica a ele; o papel `postgres` do `.env`/`DATABASE_URL` é só pras migrations):
   ```sql
   CREATE ROLE app_user WITH LOGIN PASSWORD 'escolha-uma-senha';
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO app_user;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO app_user;
   ```
3. Copie `.env.example` para `.env` e preencha `DATABASE_URL`/`APP_DATABASE_URL`.
4. `npx prisma migrate deploy && npx prisma generate`
5. `npx tsx prisma/seed.ts` — popula dados de demonstração.

**Login:** a partir da Fase 10, a autenticação é 100% Supabase Auth — sem um projeto Supabase configurado (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` no `.env`), o passo 5 popula os dados mas ninguém consegue logar. Ver `deploy/GUIA-DEPLOY.md`.

```bash
npm run dev      # http://localhost:3000
npm run jobs     # automações (recorrência, no-show, lembretes...) via node-cron, só em dev
npx playwright test   # suíte E2E (precisa de auth Supabase configurada)
```

## Deploy em produção

Ver [`deploy/GUIA-DEPLOY.md`](deploy/GUIA-DEPLOY.md) — Supabase Cloud (Postgres/Auth/pg_cron) + VPS Hostinger KVM2 via Coolify. Infra decidida: **sem Vercel/Netlify/AWS**.
