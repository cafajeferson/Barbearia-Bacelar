import { cache } from "react";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { withAppContext, type AppContext } from "@/server/db/context";

export type AuthenticatedContext = AppContext & {
  sessionUserId: string;
};

type CurrentUser = {
  id: string;
  active: boolean;
  role: AppContext["role"];
  name: string | null;
  email: string;
  professional: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
};

/**
 * Cache em memória (processo único do server standalone) da consulta de
 * usuário, com TTL curto. Por quê: com o Supabase em us-east-1 e o app no
 * Brasil, essa consulta custa ~400-600ms (transação completa), e ela roda
 * em TODA página E TODA Server Action — inclusive DUAS vezes por
 * navegação (layout + página; o React.cache() não dedupa entre os dois de
 * forma confiável, confirmado em produção). Era a maior fatia da lentidão
 * percebida do site inteiro.
 *
 * Tradeoff assumido: desativar um usuário passa a valer em até TTL_MS
 * (30s) nas requisições seguintes, em vez de instantaneamente. As ações
 * de desativar/bloquear chamam invalidateCurrentUserCache() pra encurtar
 * isso pro caso comum (mesmo processo).
 */
const TTL_MS = 30_000;
const userCache = new Map<string, { value: CurrentUser | null; expiresAt: number }>();

export function invalidateCurrentUserCache(authUserId?: string) {
  if (authUserId) userCache.delete(authUserId);
  else userCache.clear();
}

async function fetchUserFromDb(authUserId: string): Promise<CurrentUser | null> {
  return withAppContext({ role: "ADMIN", userId: null }, (tx) =>
    tx.user.findUnique({
      where: { authUserId },
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
}

/**
 * Busca crua do usuário atual — React.cache pra dedupar dentro do mesmo
 * render quando funciona, + o cache TTL acima pra atravessar requests.
 */
const fetchCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  // getSession() (não getUser()) por velocidade: getUser() faz uma chamada
  // de rede pro servidor do Supabase Auth em TODA Server Action/página —
  // getSession() só decodifica o JWT localmente (assinatura ainda validada,
  // não dá pra forjar sem o segredo). O que se perde: revogação feita
  // DIRETO no painel do Supabase (fora do app) só vale a partir da
  // expiração do JWT — a via normal de bloquear alguém (desativar no app)
  // é pega pela consulta a "active" abaixo (com o atraso do TTL do cache).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authUser = session?.user ?? null;
  if (!authUser) return null;

  const cached = userCache.get(authUser.id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const fresh = await fetchUserFromDb(authUser.id);
  userCache.set(authUser.id, { value: fresh, expiresAt: Date.now() + TTL_MS });
  return fresh;
});

/**
 * Ponto único de verdade para "quem está autenticado agora".
 *
 * Não confia no app_metadata do JWT (que o middleware usa, edge-safe, sem
 * tocar Prisma) pra decidir role/professionalId/clientId — isso vem da
 * consulta ao banco acima (fresca ou cacheada por até 30s). `active=false`
 * barra o acesso em no máximo TTL_MS após a desativação.
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

/** Nome + e-mail pra exibição (menu de perfil) — mesma consulta cacheada do getAuthContext. */
export async function getCurrentUserProfile(): Promise<{ name: string | null; email: string } | null> {
  const fresh = await fetchCurrentUser();
  if (!fresh || !fresh.active) return null;
  return {
    name: fresh.name ?? fresh.professional?.name ?? fresh.client?.name ?? null,
    email: fresh.email,
  };
}
