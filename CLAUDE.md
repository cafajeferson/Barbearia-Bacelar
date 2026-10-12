# Barbearia Bacelar

Sistema de agendamento da Barbearia Bacelar: admin, profissional e cliente (PWA). Substitui o sistema antigo do cliente (`barbearia-bacelar.ayworking.site`), que é a referência de funções e de visual — "igual ao original" é o critério de pronto.

Responder sempre em português (pt-BR). O dono do projeto não é barbeiro nem usa o sistema no dia a dia: explique o efeito para o usuário final, não só o código.

## Stack

- Next.js 14 (App Router) + TypeScript, Tailwind + shadcn/ui (`src/components/ui`).
- Prisma 7 com `@prisma/adapter-pg`; client gerado em `src/generated/prisma` (não editar).
- PostgreSQL e Auth no Supabase (região São Paulo). Login por Google e por e-mail/senha.
- Deploy: Docker num VPS, atrás do nginx do sistema.

## Comandos

```bash
npm run dev                 # http://localhost:3000
npx tsc --noEmit -p .       # checagem de tipos
npx next lint               # lint
npx playwright test         # e2e (sobe o dev server na porta 3100)
npx tsx scripts/cleanup-e2e-data.ts   # remove os dados que o e2e cria
npx prisma migrate deploy && npx prisma generate
```

Sempre rodar tsc, lint e o e2e antes de publicar, e a faxina depois do e2e.

## Atenção: não existe banco de desenvolvimento

O `.env` local aponta para o banco de **produção**. Todo script, teste e `npm run dev` lê e grava em dados reais. Confirmar com o dono antes de qualquer coisa que escreva no banco quando a barbearia já estiver usando o sistema; migrations alteram produção na hora.

## Estrutura

```
src/app/(admin)        telas do admin (dashboard, agenda, clientes, fechamento, ...)
src/app/(professional) Minha Agenda
src/app/(client)       inicio, agendar, horarios, plano
src/app/(auth)/login   login; src/app/auth/callback = retorno do Google
src/features/<area>    service.ts (regra + banco), actions.ts (Server Actions), components/
src/server/db          client.ts (pool), context.ts (withAppContext), ttl-cache.ts
src/server/auth        getAuthContext.ts, routeAccess.ts (rotas por papel)
src/server/services/jobs  automações (recorrência, no-show, lembretes, cupom, comissão)
src/shared             componentes e libs comuns (time.ts, format.ts)
prisma/                schema + migrations (incluem RLS e trigger de conflito)
e2e/                   Playwright, um spec por papel + rbac
```

## Regras que não podem ser quebradas

- **RLS de verdade.** Toda consulta passa por `withAppContext(ctx, tx => ...)`, que seta `app.role`/`app.user_id` na transação. O app conecta como `app_user` (sem privilégio); nunca usar a `DATABASE_URL` do superusuário em runtime.
- **O papel vem do servidor.** `getAuthContext()` é a única fonte de "quem é o usuário". Nunca aceitar papel ou id vindos do corpo da requisição.
- **Rota nova do admin** precisa entrar em `src/server/auth/routeAccess.ts` e no menu (`src/shared/components/admin-sidebar.tsx`); o padrão é negar.
- **Status de agendamento** só muda por `transitionAppointmentStatus` (`features/appointments/stateMachine.ts`). Fora do fluxo normal exige motivo e fica registrado.
- **Controle manual total.** Nenhuma automação pode impedir admin ou profissional de agir à mão (encaixe, sobreposição forçada, excluir atendimento).
- **Sem WhatsApp / Evolution API.** O cliente não quer; notificações são só dentro do app. O serviço em `server/services/whatsapp` é um stub.

## Datas e fuso

O servidor roda em `America/Sao_Paulo` (`TZ` no Dockerfile). Colunas `@db.Date` voltam como meia-noite **UTC**:

- para ler dia/mês de uma coluna de data, usar `dateOnlyParts` / `getCalendarWeekday` (`shared/lib/time.ts`);
- para transformar `"YYYY-MM-DD"` em data local, usar `parseLocalDate`; `new Date("2026-10-01")` cai no dia anterior no fuso do Brasil;
- para juntar data + `"HH:MM"`, usar `combineDateAndTime`.

## Desempenho

Cada `withAppContext` é uma transação (BEGIN, set_config, consulta, COMMIT). Consultas dentro da mesma `tx` rodam em série; para paralelizar, abrir transações irmãs com `Promise.all`, respeitando o pool de 5 conexões. Dados quase estáticos usam `ttlCached`. `Decimal` do Prisma não atravessa para Client Component: converter para `number` na página.

## Responsivo

Tudo precisa funcionar em celular (cerca de 400 px de largura), inclusive o admin: cabeçalhos com `flex-wrap`, nada de largura fixa que estoure a tela, menu lateral vira gaveta abaixo de `lg`.

## Deploy

No VPS, na pasta do projeto: `git pull`, `docker compose --env-file .env.production build app`, depois `docker compose --env-file .env.production up -d --no-deps --force-recreate app`. Construir antes de recriar mantém o site no ar durante o build. As variáveis `NEXT_PUBLIC_*` entram no build. Depois de publicar, o app aberto nos navegadores se recarrega sozinho (`/api/version` + `VersionWatcher`).

O mesmo VPS hospeda outros sites; não mexer neles. Segredos ficam só em `.env` / `.env.production`, nunca no repositório.

## Contas de teste

`scripts/seed-test-clients.ts` cria ou remove clientes numerados (`cliente1@bacelar.dev` ...) para teste manual; a senha é passada na linha de comando. Remover antes de a barbearia entrar em uso real.
