import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresca o token de sessão do Supabase a cada request (Edge runtime —
 * não pode tocar Prisma/pg aqui, só decodificar/validar o JWT). Retorna
 * tanto a `response` (com os cookies atualizados) quanto o `user` já
 * validado, pra src/middleware.ts decidir liberar/bloquear a rota sem
 * precisar chamar getUser() de novo.
 */
export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() (não getSession()) porque revalida o JWT contra o servidor
  // do Supabase Auth — getSession() só lê o cookie, que pode estar velho.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
