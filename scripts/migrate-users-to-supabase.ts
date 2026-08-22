import "dotenv/config";
import { syncUsersToSupabaseAuth, isSupabaseConfigured } from "./lib/syncUsersToSupabaseAuth";

/**
 * Migração única (rodar UMA vez, na Fase 10, depois que o projeto Supabase
 * já existir e SUPABASE_SERVICE_ROLE_KEY estiver no .env): cria em
 * auth.users um usuário Supabase Auth pra cada "User" já existente no
 * Postgres, vincula via User.authUserId e gera um link de redefinição de
 * senha por e-mail — ninguém migra com a senha antiga, todo mundo reseta
 * (base pequena, barbearia única, aceitável e mais seguro que tentar
 * portar hashes).
 *
 * Idempotente: pula quem já tem authUserId preenchido, então pode rodar de
 * novo com segurança se parar no meio (ex.: falha de rede numa linha).
 *
 * Sem SMTP configurado no projeto Supabase, o link de recovery não é
 * enviado por e-mail sozinho — este script imprime cada link no console
 * pra você repassar manualmente até configurar um provedor de e-mail.
 */
async function main() {
  if (!isSupabaseConfigured()) {
    console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env antes de rodar isto.");
    process.exit(1);
  }

  const results = await syncUsersToSupabaseAuth();
  console.log(`\n${results.length} usuário(s) processados.`);
  for (const r of results) {
    if (r.status === "ok") {
      console.log(`  ${r.email} → ${r.recoveryLink}`);
    } else {
      console.log(`  ${r.email}: ERRO — ${r.detail}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
