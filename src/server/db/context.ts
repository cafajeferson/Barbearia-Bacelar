import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./client";

export type AppRole = "ADMIN" | "PROFESSIONAL" | "CLIENT";

export type AppContext = {
  /** Papel do usuário autenticado — nunca aceite isto vindo do corpo da requisição. */
  role: AppRole;
  /**
   * ID relevante para o papel: Professional.id para PROFESSIONAL,
   * Client.id para CLIENT, User.id (ou null) para ADMIN.
   * Vem sempre da sessão NextAuth já verificada no servidor.
   */
  userId: string | null;
};

/**
 * Executa `fn` dentro de uma transação com `app.role`/`app.user_id` setados
 * via `set_config(..., true)` (equivalente a SET LOCAL, mas parametrizável —
 * evita interpolar string bruta em SQL). As policies de RLS em cada tabela
 * leem essas duas configs através de current_app_role()/current_app_user_id().
 *
 * Na Fase 10 (Supabase), essas duas funções passam a ler auth.jwt() — este
 * helper para de ser necessário, mas as policies continuam as mesmas.
 */
export async function withAppContext<T>(
  ctx: AppContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // As duas set_config num único round-trip (não duas) — com o Supabase
      // em us-east-1 e o app no Brasil, cada ida-e-volta custa uns
      // 200-400ms, e toda página chama withAppContext várias vezes; isso
      // sozinho já corta uma viagem inteira por transação em todo o app.
      await tx.$executeRaw`SELECT set_config('app.role', ${ctx.role}, true), set_config('app.user_id', ${ctx.userId ?? ""}, true)`;
      return fn(tx);
    },
    // maxWait maior que o default (2s) — o pool local agora tem teto
    // (max:5, ver server/db/client.ts) pra não estourar o pooler em modo
    // sessão do Supabase, então sob pico é esperado ESPERAR uma conexão
    // liberar em vez de abrir mais uma; 2s some rápido com a latência até
    // us-east-1, e um estouro aqui derruba a página inteira (P2028).
    { maxWait: 10_000, timeout: 10_000 },
  );
}
