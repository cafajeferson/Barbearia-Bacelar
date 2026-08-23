import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/server/supabase/middleware";
import { isRouteAllowed } from "@/server/auth/routeAccess";

// Qualquer arquivo estático de dentro de public/ (imagens de catálogo,
// ícones, etc.) — não dá pra confiar só em listar pasta por pasta no
// matcher abaixo (brand, manifest...): a próxima pasta nova esquecida ali
// cai na mesma armadilha que pegou /catalog (o middleware tratava o pedido
// da imagem como se fosse uma rota protegida e redirecionava pro login em
// vez de deixar o Next.js servir o arquivo estático).
const STATIC_FILE_PATTERN = /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|map)$/i;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (STATIC_FILE_PATTERN.test(pathname)) {
    return NextResponse.next();
  }

  const { response, user } = await updateSupabaseSession(request);
  // role vem de app_metadata (setado via Admin API na migração/criação do
  // usuário — só o servidor escreve nisso, nunca o próprio usuário), que o
  // Supabase já embute no JWT. Não faz round-trip ao Prisma aqui de
  // propósito: middleware roda em Edge runtime.
  const role = user?.app_metadata?.role as string | undefined;

  if (!isRouteAllowed(pathname, role)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // /auth/callback (troca de code do OAuth por sessão) fica de fora do
  // gate igual /api — ele PRECISA rodar antes de qualquer cookie de
  // sessão existir, então nunca teria um "role" pra passar em
  // isRouteAllowed.
  matcher: ["/((?!api|auth|_next/static|_next/image|favicon.ico|brand|manifest).*)"],
};
