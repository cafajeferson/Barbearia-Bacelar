"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { getRoleSwitch, PROFESSIONAL_MODE_COOKIE } from "./getAuthContext";

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(PROFESSIONAL_MODE_COOKIE);
  redirect("/login");
}

/** Admin que também é barbeiro: alterna entre a visão de admin e a de colaborador. */
export async function switchRoleModeAction(mode: "admin" | "colaborador") {
  const sw = await getRoleSwitch();
  if (!sw) throw new Error("Esta conta não tem cadastro de colaborador.");
  const jar = await cookies();
  if (mode === "colaborador") {
    jar.set(PROFESSIONAL_MODE_COOKIE, "colaborador", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/minha-agenda");
  }
  jar.delete(PROFESSIONAL_MODE_COOKIE);
  redirect("/dashboard");
}
