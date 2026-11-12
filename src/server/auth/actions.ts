"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { withAppContext } from "@/server/db/context";
import { createOwnProfessionalProfile } from "@/features/professionals/service";
import {
  getAuthContext,
  getRoleSwitch,
  invalidateCurrentUserCache,
  PROFILE_MODE_COOKIE,
  type ProfileMode,
} from "./getAuthContext";

const HOME: Record<ProfileMode, string> = {
  admin: "/dashboard",
  profissional: "/minha-agenda",
  cliente: "/inicio",
};

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(PROFILE_MODE_COOKIE);
  redirect("/login");
}

/**
 * "Trocar perfil": admin -> Administrador / Profissional / Cliente;
 * profissional -> Profissional / Cliente.
 * - Profissional sem cadastro de barbeiro: cria com `professionalName`
 *   (o menu pergunta o nome antes).
 * - Cliente sem cadastro de cliente: cria na hora com o nome e e-mail da conta.
 */
export async function switchProfileAction(mode: ProfileMode, professionalName?: string) {
  const sw = await getRoleSwitch();
  const ctx = await getAuthContext();
  if (!sw || !ctx || !sw.options.includes(mode)) throw new Error("Esta conta não pode trocar para esse perfil.");
  const userId = ctx.sessionUserId;
  const isAdmin = sw.options.includes("admin");

  if (mode === "profissional" && !sw.hasProfessional) {
    const name = professionalName?.trim() ?? "";
    if (name.length < 2) throw new Error("Informe o nome que vai aparecer na agenda.");
    if (!isAdmin) throw new Error("Só o admin cria o próprio cadastro de profissional.");
    await createOwnProfessionalProfile({ ctx: { role: "ADMIN", userId, sessionUserId: userId }, name });
  }
  if (mode === "cliente" && !sw.hasClient) {
    // Cadastro de cliente da própria conta (contexto de sistema: o profissional
    // não tem permissão de criar clientes pelo RLS).
    await withAppContext({ role: "ADMIN", userId: null }, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { professional: true } });
      await tx.client.create({
        data: {
          userId: user.id,
          name: user.name ?? user.professional?.name ?? user.email.split("@")[0],
          email: user.email,
          phone: user.phone,
        },
      });
    });
    invalidateCurrentUserCache();
  }

  const jar = await cookies();
  // Voltar para o perfil de origem da conta = sem cookie.
  if (mode === "admin" || (mode === "profissional" && !isAdmin)) jar.delete(PROFILE_MODE_COOKIE);
  else
    jar.set(PROFILE_MODE_COOKIE, mode, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  redirect(HOME[mode]);
}
