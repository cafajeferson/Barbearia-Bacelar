"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { getAuthContext } from "@/server/auth/getAuthContext";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/dashboard",
  PROFESSIONAL: "/minha-agenda",
  CLIENT: "/inicio",
};

/**
 * Login rápido para os clientes de TESTE (só com TEST_CLIENT_LOGIN=on no
 * ambiente): "cliente 7" + "123" vira cliente7@bacelar.dev + a senha com o
 * sufixo abaixo. O Supabase exige e-mail e senha de no mínimo 6
 * caracteres, então a conta de verdade é criada por
 * scripts/seed-test-clients.ts com senha "123" + TEST_PASSWORD_SUFFIX.
 * Só alcança as contas de teste: cliente1..clienteN@bacelar.dev (CLIENT) e,
 * com "admin", admin@bacelar.dev (ADMIN).
 * DESLIGAR (tirar a variável) antes de a barbearia usar o sistema de verdade.
 */
const TEST_PASSWORD_SUFFIX = "-bacelar";

function resolveTestAlias(identifier: string, password: string) {
  if (process.env.TEST_CLIENT_LOGIN !== "on") return null;
  const id = identifier.trim().toLowerCase();
  // "admin" -> conta de teste do administrador (admin@bacelar.dev).
  if (id === "admin") return { email: "admin@bacelar.dev", password: password + TEST_PASSWORD_SUFFIX };
  const match = id.match(/^cliente\s*(\d{1,3})$/);
  if (!match) return null;
  return { email: `cliente${Number(match[1])}@bacelar.dev`, password: password + TEST_PASSWORD_SUFFIX };
}

export async function loginAction(formData: FormData): Promise<void> {
  let email = String(formData.get("email") ?? "");
  let password = String(formData.get("password") ?? "");
  const alias = resolveTestAlias(email, password);
  if (alias) ({ email, password } = alias);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Redireciona com ?error= (mesmo padrão do callback do Google) em vez
    // de retornar {error} pro form ler via onSubmit: o <form> agora usa
    // action={loginAction} direto (sem onSubmit/preventDefault), que
    // funciona via POST nativo mesmo ANTES da página hidratar — não dá
    // pra "ler o retorno" desse jeito, só redirect() é visível sem JS.
    redirect("/login?error=credenciais");
  }

  // Redireciona direto pra home do papel em vez de pra "/" (que também
  // redireciona de novo com base no papel) — um redirect() encadeado a
  // partir do redirect() de uma Server Action não é seguido de forma
  // confiável pelo App Router: o cliente resolve só o primeiro nível e
  // fica parado em "/" em vez de continuar até o destino final.
  const ctx = await getAuthContext();
  redirect(ctx ? ROLE_HOME[ctx.role] : "/login");
}
