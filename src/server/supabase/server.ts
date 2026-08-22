import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente Supabase pra uso em Server Components/Actions/Route Handlers —
 * lê/escreve os cookies de sessão via `next/headers`. Nunca cacheie a
 * instância entre requests (cada chamada pega os cookies do request atual).
 *
 * Em Server Components puros, `cookies().set()` lança (Next não deixa
 * escrever cookie fora de Server Action/Route Handler) — por isso o catch
 * vazio no `setAll`: o middleware (`src/server/supabase/middleware.ts`) já
 * garante que a sessão é refrescada a cada request, então um Server
 * Component só-leitura pode ignorar a falha de escrita sem problema.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Ver comentário acima — só falha em Server Component, onde não
          // faz diferença porque o middleware já cuida do refresh.
        }
      },
    },
  });
}
