import { cache } from "react";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { withAppContext, type AppContext } from "@/server/db/context";

export type AuthenticatedContext = AppContext & {
  sessionUserId: string;
};

/**
 * Busca crua do usuário atual, cacheada por request (React.cache) — layout
 * E página costumam precisar disso na mesma requisição (ex.: layout checa
 * role/pega o nome pro header, a página usa getAuthContext() de novo pra
 * consultar dados); sem o cache, isso seria 2 round-trips ao banco em vez
 * de 1. `supabase.auth.getUser()` também já é memoizado pelo próprio
 * @supabase/ssr por request.
 */
const fetchCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  return withAppContext({ role: "ADMIN", userId: null }, (tx) =>
    tx.user.findUnique({
      where: { authUserId: authUser.id },
      select: {
        id: true,
        active: true,
        role: true,
        name: true,
        professional: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    }),
  );
});

/**
 * Ponto único de verdade para "quem está autenticado agora".
 *
 * Não confia só no JWT do Supabase: `supabase.auth.getUser()` já revalida
 * a sessão contra o servidor do Supabase Auth (não é um simples decode),
 * mas quem manda em role/professionalId/clientId é sempre esta consulta ao
 * banco — nunca o app_metadata do token, que o middleware usa (edge-safe,
 * sem tocar Prisma) mas o resto do app não deveria confiar cegamente. Como
 * essa consulta já roda em toda chamada, `active=false` (ver
 * deactivateProfessional/bloquear cliente) já barra o acesso na hora —
 * não precisa mais comparar tokenVersion feito no NextAuth (a coluna
 * continua existindo, é só que deixou de ser a fonte da checagem).
 *
 * Toda rota de API e Server Action que precisa saber quem é o usuário deve
 * passar por aqui, nunca ler `role` direto do corpo da requisição.
 */
export async function getAuthContext(): Promise<AuthenticatedContext | null> {
  const fresh = await fetchCurrentUser();
  if (!fresh || !fresh.active) return null;

  const userId =
    fresh.role === "PROFESSIONAL"
      ? (fresh.professional?.id ?? null)
      : fresh.role === "CLIENT"
        ? (fresh.client?.id ?? null)
        : fresh.id;

  return { role: fresh.role, userId, sessionUserId: fresh.id };
}

/** Nome pra exibição (header do admin/profissional) — role já vem do ctx normal. */
export async function getCurrentUserName(): Promise<string | null> {
  const fresh = await fetchCurrentUser();
  if (!fresh || !fresh.active) return null;
  return fresh.name ?? fresh.professional?.name ?? fresh.client?.name ?? null;
}
