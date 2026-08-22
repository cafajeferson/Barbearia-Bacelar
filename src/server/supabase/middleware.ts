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

  // getSession() (não getUser()) de propósito aqui: getUser() faz uma
  // chamada de rede pro servidor do Supabase Auth em TODA navegação, o que
  // se soma à latência real (Supabase em us-east-1, VPS no Brasil) e deixa
  // o site visivelmente lento. Middleware é só a 1ª linha de defesa (troca
  // de rota/UX) — a checagem de verdade, com getUser() + revalidação
  // fresca de active/tokenVersion no banco, já acontece em toda
  // Server Action/página via getAuthContext(). getSession() decodifica o
  // JWT localmente, sem round-trip.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { response, user: session?.user ?? null };
}
