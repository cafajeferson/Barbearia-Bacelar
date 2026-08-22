import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com a service_role key — bypassa RLS e tem acesso à
 * Admin API de Auth (criar/atualizar/deletar usuários, gerar link de
 * reset de senha). NUNCA importe isto em código que roda no browser ou
 * em qualquer coisa exposta como Server Action pública — é só pra rotas
 * internas (scripts de migração, jobs administrativos) que já garantem
 * que quem chama é o próprio sistema, não o usuário final.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
