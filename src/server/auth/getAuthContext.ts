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
  // getSession() (não getUser()) por velocidade: getUser() faz uma chamada
  // de rede pro servidor do Supabase Auth em TODA Server Action/página —
  // com o Supabase em us-east-1 e o app no Brasil, isso é a maior fonte de
  // lentidão sentida em qualquer clique. getSession() só decodifica o JWT
  // localmente (assinatura ainda validada, não dá pra forjar sem o
  // segredo). O que se perde: revogação feita DIRETO no painel do
  // Supabase (fora do app) só valeria a partir da expiração do JWT, não
  // instantaneamente — mas a via normal de bloquear alguém (desativar
  // profissional/cliente aqui no app) já é pega na hora pela consulta a
  // "active" logo abaixo, que roda sempre, com dado fresco do banco.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authUser = session?.user ?? null;
  if (!authUser) return null;

  return withAppContext({ role: "ADMIN", userId: null }, (tx) =>
    tx.user.findUnique({
      where: { authUserId: authUser.id },
      select: {
        id: true,
        active: true,
        role: true,
        name: true,
        email: true,
        professional: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    }),
  );
});

/**
 * Ponto único de verdade para "quem está autenticado agora".
 *
 * Não confia no app_metadata do JWT (que o middleware usa, edge-safe, sem
 * tocar Prisma) pra decidir role/professionalId/clientId — isso sempre
 * vem de uma consulta fresca ao banco aqui embaixo. Como essa consulta já
 * roda em toda chamada, `active=false` (ver deactivateProfessional/
 * bloquear cliente) já barra o acesso na hora —
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

/** Nome + e-mail pra exibição (menu de perfil) — mesma requisição cacheada do getAuthContext. */
export async function getCurrentUserProfile(): Promise<{ name: string | null; email: string } | null> {
  const fresh = await fetchCurrentUser();
  if (!fresh || !fresh.active) return null;
  return {
    name: fresh.name ?? fresh.professional?.name ?? fresh.client?.name ?? null,
    email: fresh.email,
  };
}
