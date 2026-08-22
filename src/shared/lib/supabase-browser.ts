import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase pro browser — só pra fluxos que precisam mesmo rodar
 * no client (ex.: signInWithOAuth, que abre um redirect de verdade do
 * navegador pro Google). O resto do app usa createSupabaseServerClient
 * (Server Components/Actions) ou createSupabaseAdminClient (scripts).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
