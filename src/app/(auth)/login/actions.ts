"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { getAuthContext } from "@/server/auth/getAuthContext";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/dashboard",
  PROFESSIONAL: "/minha-agenda",
  CLIENT: "/inicio",
};

export async function loginAction(formData: FormData): Promise<{ error: string } | void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }

  // Redireciona direto pra home do papel em vez de pra "/" (que também
  // redireciona de novo com base no papel) — um redirect() encadeado a
  // partir do redirect() de uma Server Action não é seguido de forma
  // confiável pelo App Router: o cliente resolve só o primeiro nível e
  // fica parado em "/" em vez de continuar até o destino final.
  const ctx = await getAuthContext();
  redirect(ctx ? ROLE_HOME[ctx.role] : "/login");
}
