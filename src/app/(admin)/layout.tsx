import { redirect } from "next/navigation";
import { getAuthContext, getCurrentUserProfile, getRoleSwitch } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { ttlCached } from "@/server/db/ttl-cache";
import { AdminMobileNav, AdminSidebar } from "@/shared/components/admin-sidebar";
import { AdminTopbar } from "@/shared/components/admin-topbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  // Admin em outro perfil (Profissional / Cliente): as telas de admin ficam
  // fora até ele voltar pelo "Trocar perfil".
  const profileSwitch = await getRoleSwitch();
  if (ctx.role !== "ADMIN") redirect(profileSwitch?.mode === "profissional" ? "/minha-agenda" : profileSwitch?.mode === "cliente" ? "/inicio" : "/login");
  // Sequencial, não Promise.all: getCurrentUserName() reaproveita a mesma
  // transação já cacheada do getAuthContext() acima (mesmo request) — rodar
  // em paralelo com a consulta de units só arriscaria abrir conexão nova à
  // toa, sem ganhar tempo real (visto o pooler do Supabase já ter recusado
  // transação por excesso de conexões simultâneas nessa página).
  const profile = await getCurrentUserProfile();
  const name = profile?.name ?? null;
  // Unidades mudam raramente, mas esse layout roda em TODA navegação do
  // admin — 60s de cache em memória tira uma transação (~500ms) de cada.
  const units = await ttlCached("admin-layout:units", 60_000, () =>
    withAppContext(ctx, (tx) =>
      tx.unit.findMany({ where: { active: true }, select: { id: true, name: true, address: true } }),
    ),
  );

  return (
    <div className="flex min-h-screen">
      <AdminSidebar userName={name ?? "Admin"} userEmail={profile?.email ?? ""} avatarUrl={profile?.avatarUrl ?? null} profileSwitch={profileSwitch} />
      {/* min-w-0: sem isso um filho largo (tabela, grade da agenda) empurra
          a coluna pra fora da tela no celular em vez de rolar dentro dela. */}
      <div className="min-w-0 flex-1">
        <AdminTopbar
          units={units}
          leading={<AdminMobileNav userName={name ?? "Admin"} userEmail={profile?.email ?? ""} avatarUrl={profile?.avatarUrl ?? null} profileSwitch={profileSwitch} />}
        />
        {children}
      </div>
    </div>
  );
}
