import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  // APP_DATABASE_URL passa pelo pooler do Supabase em modo *session*
  // (porta 5432 — ver GUIA-DEPLOY.md), não modo *transaction* — cada
  // conexão do nosso pg.Pool prende uma conexão de verdade no backend
  // pelo tempo todo, então esse pool NÃO pode crescer sem limite (o
  // default do driver `pg` é max:10). Sem um teto explícito, um pico de
  // `withAppContext` concorrentes já causou "P2028 Unable to start a
  // transaction" — o app tentando abrir mais conexões do que o pooler
  // aguenta em modo sessão. O teto (max) é o que protege o pooler.
  //
  // idleTimeout LONGO de propósito: abrir uma conexão nova custa ~500ms
  // medidos do VPS (TCP + TLS + auth, várias idas-e-voltas até us-east-1).
  // Com os 10s de antes, num site de tráfego esparso praticamente todo
  // clique encontrava o pool vazio e pagava esse meio segundo ANTES da
  // primeira consulta. As 5 conexões ficam abertas entre um acesso e
  // outro; keepAlive evita que morram em silêncio por ociosidade na rede.
  const adapter = new PrismaPg({
    connectionString: process.env.APP_DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10 * 60_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  return new PrismaClient({ adapter });
}

// Conecta como "app_user" (não-superusuário) — é o papel a que as policies
// de RLS realmente se aplicam. Nunca troque isto pela DATABASE_URL do
// superusuário "postgres" usada pelo `prisma migrate`.
export const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
