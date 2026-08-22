# Guia de Deploy — Fase 10 (Supabase + Hostinger VPS KVM2)

Este guia assume que você já tem: uma conta Supabase, acesso à VPS Hostinger KVM2 (IP + SSH) e um domínio apontável pra ela. Nada disso foi provisionado por mim — eu preparei todo o código, mas as contas/credenciais só você pode criar.

**Importante:** a troca de NextAuth pra Supabase Auth (login, middleware, `getAuthContext()`) foi escrita nesta sessão sem um projeto Supabase real pra testar contra — é código novo, revisado com cuidado, mas **não verificado em execução real**. Trate o Passo 5 como o ponto crítico: teste o login dos 3 papéis assim que o projeto existir, antes de seguir pro deploy na VPS.

---

## 1. Criar o projeto Supabase

1. Crie o projeto em [supabase.com](https://supabase.com) (região mais próxima do Brasil: `sa-east-1`, São Paulo).
2. Anote a senha do Postgres que você definir na criação — é o `DATABASE_URL`.
3. Em **Project Settings → API**, anote:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secreta — nunca exponha)
4. Em **Project Settings → Database → Connection string**, use a conexão **direta** (porta 5432, não a poolada 6543) pra `DATABASE_URL` — o Prisma Migrate precisa dela.

## 2. Criar o papel `app_user` no Postgres do Supabase

O runtime do app conecta com um papel não-superusuário pra que RLS realmente se aplique (o `postgres` do Supabase, como qualquer superusuário, ignora RLS). Rode isto no **SQL Editor** do painel Supabase, uma vez:

```sql
CREATE ROLE app_user WITH LOGIN PASSWORD 'GERE_UMA_SENHA_FORTE_AQUI';

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO app_user;
```

(Isto reproduz exatamente o que a migration `rls_and_overlap_guard` já faz pras tabelas — só o `CREATE ROLE` em si que sempre rodou fora do versionamento, por conter senha.)

`APP_DATABASE_URL` usa esse papel, mesma connection string do passo 1 trocando usuário/senha:
```
postgresql://app_user:SUA_SENHA@SEU_HOST:5432/postgres
```

**Verificar antes de seguir:** o pooler do Supabase (Supavisor, porta 6543) pode ter restrições com papéis customizados dependendo do modo de pooling — se decidir usar o pooler em vez da conexão direta pro app_user, teste isso especificamente; não foi validado aqui.

## 3. Rodar as migrations

```bash
# .env local, temporariamente apontando pro Supabase:
DATABASE_URL="postgresql://postgres:SENHA_DO_PASSO_1@SEU_HOST:5432/postgres"

npx prisma migrate deploy
```

Isso aplica as ~14 migrations (schema + RLS + triggers) no Postgres do Supabase, incluindo a mais recente (`add_supabase_auth_user_id`, que adiciona `User.authUserId`).

## 4. Variáveis de ambiente

Preencha `.env` (local, só pra rodar os passos 5/6 a partir da sua máquina) e depois `.env.production` (que vai pra VPS) com base em `.env.example` — `DATABASE_URL`/`APP_DATABASE_URL` do Supabase, as 3 chaves Supabase do passo 1, e gere `JOBS_SECRET` com `openssl rand -hex 32`.

## 5. Migrar/criar os usuários no Supabase Auth

**Ponto crítico — teste aqui antes de continuar.**

```bash
npx tsx scripts/migrate-users-to-supabase.ts
```

Isso cria uma conta em `auth.users` pra cada `User` existente (sem senha própria — gera um link de recovery pra cada um, impresso no terminal) e vincula via `User.authUserId`. Sem um provedor SMTP configurado no Supabase (**Project Settings → Auth → SMTP Settings**), o link não é enviado por e-mail sozinho — repasse manualmente (WhatsApp, e-mail avulso) até configurar um provedor.

Depois de rodar:
1. Abra um dos links de recovery impressos, defina uma senha.
2. Rode `npm run dev` local (com `.env` apontando pro Supabase) e tente logar com esse usuário.
3. Confirme: login funciona, o middleware bloqueia rota de outro papel, `getAuthContext()` retorna o `role`/`userId` certos.

Se algo quebrar aqui, é mais barato descobrir agora do que depois do deploy na VPS.

Pra popular um projeto novo do zero (sem usuários pré-existentes vindos do dev local), rode `npx tsx prisma/seed.ts` com o `.env` já apontando pro Supabase — o seed cria os `User`/dados de negócio E as contas Supabase Auth juntas (com a senha de demonstração, útil só em ambiente de teste — troque antes de ir ao ar de verdade).

## 6. Automações agendadas (pg_cron)

Abra `deploy/pg_cron_setup.sql`, troque `SEU_DOMINIO` e `SEU_JOBS_SECRET` pelos valores reais, e rode o conteúdo no SQL Editor do Supabase. Isso agenda chamadas HTTP (via `pg_net`) pras rotas `/api/jobs/*` do app nos mesmos horários que `scripts/run-jobs.ts` usa em dev.

Note que os cron schedules em `pg_cron` rodam no fuso do servidor Postgres (geralmente UTC no Supabase) — ajuste os horários no SQL se quiser alinhar com horário de Brasília (UTC-3): some 3h ao horário desejado (ex.: quer rodar às 03:00 local → agende `0 6 * * *`).

## 7. WhatsApp (Evolution API)

O `docker-compose.yml` já sobe o `evolution-api` junto com o app na VPS. Depois do deploy (passo 9), acesse a instância (`http://SEU_IP:8080` ou via Coolify) pra parear o número via QR code. Preencha `EVOLUTION_API_URL`/`EVOLUTION_API_KEY`/`EVOLUTION_INSTANCE_NAME` no `.env.production` com os mesmos valores usados no compose.

`src/server/services/whatsapp/index.ts` foi implementado contra o formato documentado da Evolution API v2 (`POST /message/sendText/{instance}`) — **nunca testado contra uma instância real**. Depois de parear o WhatsApp, force um lembrete de teste (`runReminderSchedulerAction` em Configurações) e confira se a mensagem chegou; se o formato da versão que você instalar for diferente, ajuste ali.

## 8. Provisionar a VPS (Coolify)

1. SSH na VPS Hostinger KVM2, instale o Coolify: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`.
2. No painel do Coolify, crie um novo projeto apontando pro Dockerfile deste repositório (ou pro `docker-compose.yml`, se preferir gerenciar app + Evolution API como uma unidade).
3. Configure o domínio no Coolify — ele emite o certificado SSL (Let's Encrypt) automaticamente via Traefik, sem precisar do `deploy/nginx.example.conf` (esse arquivo é só um fallback caso troque de gerenciador de container no futuro).
4. Cole o conteúdo de `.env.production` nas variáveis de ambiente do serviço no Coolify.

## 9. Apontar o domínio Hostinger

No painel de DNS da Hostinger, aponte um registro `A` do domínio (ou subdomínio) pro IP da VPS. Propagação pode levar até algumas horas.

## 10. Verificação final

- Rode `python .agent/scripts/verify_all.py .` em staging antes de apontar o domínio de verdade (é o gate que todas as fases anteriores já usaram).
- `npx playwright test` contra a URL de produção antes de anunciar o go-live pros usuários reais — ajuste `playwright.config.ts`/`baseURL` temporariamente ou rode manualmente os fluxos golden-path dos 3 papéis.
- Confirme RLS de verdade: tente, autenticado como CLIENT, acessar um agendamento de outro cliente via a Server Action direto (não só pela UI) — deve ser bloqueado.
- Rode `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .` uma última vez contra o código já com as envs de produção fora do repo.
- Confirme os cron jobs rodando: `select * from cron.job_run_details order by start_time desc limit 20;` no SQL Editor do Supabase, depois da primeira hora cheia.
