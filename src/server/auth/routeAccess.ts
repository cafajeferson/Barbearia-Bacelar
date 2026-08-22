/**
 * Mapa de prefixos de rota por papel — edge-safe (sem Prisma/pg), usado
 * pelo middleware (`src/middleware.ts`, Fase 10: Supabase Auth) pra decidir
 * liberar/bloquear a navegação. Nunca é a única checagem: cada Server
 * Action/página revalida com getAuthContext() antes de tocar no banco.
 */
const ADMIN_PREFIXES = [
  "/dashboard",
  "/agenda",
  "/recorrencias",
  "/clientes",
  "/equipe",
  "/catalogo",
  "/produtos",
  "/comissoes",
  "/assinaturas",
  "/promocoes",
  "/cupons",
  "/em-aberto",
  "/configuracoes",
];
const PROFESSIONAL_PREFIXES = ["/minha-agenda"];
const CLIENT_PREFIXES = ["/inicio", "/horarios", "/agendar", "/plano"];
// Única exceção: raiz redireciona por papel (ou pra /login) sozinha, e
// /login precisa ser público. Qualquer rota nova PRECISA entrar numa das
// listas acima — default é negar, não permitir.
const PUBLIC_PATHS = ["/", "/login"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isRouteAllowed(pathname: string, role: string | undefined): boolean {
  if (matches(pathname, ADMIN_PREFIXES)) return role === "ADMIN";
  if (matches(pathname, PROFESSIONAL_PREFIXES)) return role === "PROFESSIONAL";
  if (matches(pathname, CLIENT_PREFIXES)) return role === "CLIENT";
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return false;
}
