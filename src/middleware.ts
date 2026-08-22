import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/server/supabase/middleware";
import { isRouteAllowed } from "@/server/auth/routeAccess";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request);

  const pathname = request.nextUrl.pathname;
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|brand|manifest).*)"],
};
