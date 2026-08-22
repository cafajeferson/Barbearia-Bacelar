# Guia de Deploy — Fase 10 (Supabase + Hostinger VPS KVM2)

Este guia assume que você já tem: uma conta Supabase, acesso à VPS Hostinger KVM2 (IP + SSH) e um domínio apontável pra ela. Nada disso foi provisionado por mim — eu preparei todo o código, mas as contas/credenciais só você pode criar.

**Já verificado de verdade contra um projeto Supabase real** (não é mais teórico): auth dos 3 papéis, RLS, e a suíte E2E completa (19/19) rodando duas vezes seguidas. Os pontos abaixo marcados com ⚠️ são armadilhas reais que apareceram nesse processo — não pule.

---

## 1. Criar o projeto Supabase

1. Crie o projeto em [supabase.com](https://supabase.com) (região mais próxima do Brasil: `sa-east-1`, São Paulo, ou `us-east-1` se essa não estiver disponível no seu plano).
2. Anote a senha do Postgres que você definir na criação.
3. Em **Project Settings → API**, anote:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Chave publicável (`sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Chave secreta (`sb_secret_...`) → `SUPABASE_SERVICE_ROLE_KEY` (nunca exponha)
4. ⚠️ **Use o pooler (Supavisor), não a conexão direta.** A conexão direta (`db.SEU_REF.supabase.co:5432`) só resolve em IPv6 — em redes sem rota IPv6 funcional (comum em provedores residenciais/VPS mais antigas), a conexão simplesmente trava sem erro. O pooler aceita IPv4 e funciona igual pra tudo que este projeto precisa (inclusive `prisma migrate`, usando o modo sessão, porta 5432 — não a 6543 transaction). Pegue o host/user em **Project Settings → Database → Connection Pooling**:
   ```
   DATABASE_URL="postgresql://postgres.SEU_REF:SENHA@SEU_POOLER_HOST:5432/postgres?pgbouncer=true"
   ```
5. ⚠️ **`?pgbouncer=true` não é opcional.** Sem esse parâmetro, sequências de várias operações Prisma numa mesma execução (o seed, por exemplo) falham de forma **não-determinística** — às vezes com "violation of row-level security policy" mesmo a policy estando certa, às vezes com um retorno sem `id`. É uma interação conhecida entre o query-interpreter novo do Prisma 7 e o Supavisor: o parâmetro desliga prepared statements e resolve. Isso já está aplicado em `.env.example`; não remova.
6. Se a senha do Postgres que você anotou no passo 2 não autenticar (aconteceu aqui — a causa exata ficou incerta), resete via **Project Settings → Database → Reset Database Password** e use a nova.

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

`APP_DATABASE_URL` usa esse papel, mesmo host/porta do pooler (passo 1.4), trocando usuário (`app_user.SEU_REF`, não só `app_user`) e senha — o Supavisor exige o ref do projeto sufixado no username pra rotear a conexão certo:
```
postgresql://app_user.SEU_REF:SUA_SENHA@SEU_POOLER_HOST:5432/postgres?pgbouncer=true
```

## 3. Rodar as migrations

```bash
# .env local apontando pro Supabase (pooler + pgbouncer=true, ver passo 1):
npx prisma migrate deploy
```

Isso aplica as ~15 migrations (schema + RLS + triggers) no Postgres do Supabase, incluindo `add_supabase_auth_user_id` (`User.authUserId`) e `password_hash_nullable`.

## 4. Variáveis de ambiente

Preencha `.env` (local, só pra rodar os passos 5/6 a partir da sua máquina) e depois `.env.production` (que vai pra VPS) com base em `.env.example` — `DATABASE_URL`/`APP_DATABASE_URL` do Supabase (pooler + `pgbouncer=true`), as 3 chaves Supabase do passo 1, e gere `JOBS_SECRET` com `openssl rand -hex 32`.

## 5. Migrar/criar os usuários no Supabase Auth

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

## 8. Provisionar na VPS — sem Coolify

⚠️ **Mudança em relação ao plano original:** a VPS Hostinger KVM2 já hospeda dois outros sites em produção (nginx do sistema + Certbot, fora de container) — não é uma VPS dedicada. O instalador padrão do Coolify toma as portas 80/443 pra si (proxy Traefik próprio), o que derrubaria os sites existentes. Por isso o Barbearia Bacelar entra como **mais um site no nginx que já roda aí**, não via Coolify.

1. Confirme que o Docker já está instalado na VPS (`docker --version`) — geralmente já está.
2. Envie o código pra VPS (`git clone` do repositório, ou `git pull` se já clonado).
3. Suba os dois serviços (app + Evolution API) via `docker-compose.yml` — já configurado pra expor o app só em `127.0.0.1:3001` (não 3000/5000, que colidiriam com o outro site "pedidos"):
   ```bash
   cd /caminho/do/projeto
   docker compose up -d --build
   ```
4. Adicione um novo site no nginx do sistema, reaproveitando o domínio (passo 9) — baseado em `deploy/nginx.example.conf`, mas apontando `proxy_pass` pra `http://127.0.0.1:3001` em vez de `3000`.
5. `EVOLUTION_API_URL` no `.env.production` deve ser `http://evolution-api:8080` (nome do serviço na rede interna do compose) — não `localhost`, já que app e Evolution API rodam em containers separados.

## 9. Domínio — reaproveitando `pauliceiatintasrelatorios.com`

O domínio decidido foi reaproveitar `pauliceiatintasrelatorios.com` (antes servia um dashboard estático de outro projeto, que não é mais necessário). Passos na VPS:

1. **Desative (não apague) o site antigo** que serve esse domínio hoje — está em `/etc/nginx/sites-enabled/pauliceia`. Mova pra fora do `sites-enabled` (`sudo mv /etc/nginx/sites-enabled/pauliceia /etc/nginx/sites-available/pauliceia.disabled` ou similar) em vez de deletar, pra ser reversível.
2. **Reaproveite o certificado Certbot já emitido** pra esse domínio — não precisa reemitir. Crie o novo bloco de site (passo 8.5) usando `ssl_certificate`/`ssl_certificate_key` apontando pros mesmos arquivos em `/etc/letsencrypt/live/pauliceiatintasrelatorios.com/`.
3. `sudo nginx -t` (testa a config) e `sudo systemctl reload nginx`.
4. O DNS do domínio já aponta pra essa VPS (é o mesmo domínio que já estava em uso) — não precisa mexer no DNS.

## 10. Verificação final

- Rode `python .agent/scripts/verify_all.py .` em staging antes de apontar o domínio de verdade (é o gate que todas as fases anteriores já usaram).
- `npx playwright test` contra a URL de produção antes de anunciar o go-live pros usuários reais — ajuste `playwright.config.ts`/`baseURL` temporariamente ou rode manualmente os fluxos golden-path dos 3 papéis.
- Confirme RLS de verdade: tente, autenticado como CLIENT, acessar um agendamento de outro cliente via a Server Action direto (não só pela UI) — deve ser bloqueado.
- Rode `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .` uma última vez contra o código já com as envs de produção fora do repo.
- Confirme os cron jobs rodando: `select * from cron.job_run_details order by start_time desc limit 20;` no SQL Editor do Supabase, depois da primeira hora cheia.
