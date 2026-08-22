import { withAppContext, type AppContext } from "../../src/server/db/context";
import type { AuthenticatedContext } from "../../src/server/auth/getAuthContext";
import { createSupabaseAdminClient } from "../../src/server/supabase/admin";

function ctxFor(role: AppContext["role"], userId: string | null, sessionUserId: string): AuthenticatedContext {
  return { role, userId, sessionUserId };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Cria em auth.users um usuário Supabase Auth pra cada "User" local que
 * ainda não tem `authUserId`, e vincula os dois. Usada tanto pelo seed
 * local (prisma/seed.ts, com senha conhecida — conveniência de dev) quanto
 * pelo script de migração de produção (scripts/migrate-users-to-supabase.ts,
 * sem senha — força link de recovery). Idempotente: quem já tem
 * authUserId é pulado.
 *
 * `password`: se informado, cria com essa senha (uso de dev/seed). Se
 * omitido, a Admin API gera uma senha aleatória interna e a única forma de
 * entrar é pelo link de recovery retornado em `recoveryLink` — pensado
 * pra migração real de usuários existentes (ver scripts/migrate-users-to-supabase.ts).
 */
export async function syncUsersToSupabaseAuth(options: { password?: string } = {}) {
  if (!isSupabaseConfigured()) {
    console.log("Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes) — pulando.");
    return [];
  }

  const bootstrap = ctxFor("ADMIN", null, "sync-script");
  const admin = createSupabaseAdminClient();

  const users = await withAppContext(bootstrap, (tx) =>
    tx.user.findMany({
      where: { authUserId: null },
      select: { id: true, email: true, role: true },
    }),
  );

  const results: { email: string; status: "ok" | "erro"; recoveryLink?: string; detail?: string }[] = [];

  for (const user of users) {
    try {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email,
        password: options.password,
        email_confirm: true,
        app_metadata: { role: user.role },
      });

      if (error || !data.user) {
        results.push({ email: user.email, status: "erro", detail: error?.message ?? "sem detalhes" });
        continue;
      }

      await withAppContext(bootstrap, (tx) =>
        tx.user.update({ where: { id: user.id }, data: { authUserId: data.user.id } }),
      );

      if (options.password) {
        results.push({ email: user.email, status: "ok" });
        continue;
      }

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: user.email,
      });
      results.push({
        email: user.email,
        status: linkError ? "erro" : "ok",
        recoveryLink: linkData?.properties?.action_link,
        detail: linkError?.message,
      });
    } catch (err) {
      results.push({ email: user.email, status: "erro", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}
