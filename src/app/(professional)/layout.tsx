import { redirect } from "next/navigation";
import Image from "next/image";
import { getAuthContext, getCurrentUserProfile, getRoleSwitch } from "@/server/auth/getAuthContext";
import { ProfileMenu } from "@/shared/components/profile-menu";
import { LogoutButton } from "@/shared/components/logout-button";
import { ProfessionalNav } from "@/shared/components/professional-nav";

export default async function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  // Admin que não está no perfil Profissional e caiu numa rota de profissional.
  if (ctx.role === "ADMIN") redirect("/dashboard");
  if (ctx.role !== "PROFESSIONAL") redirect("/login");
  const [profile, profileSwitch] = await Promise.all([getCurrentUserProfile(), getRoleSwitch()]);
  const name = profile?.name ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Image src="/brand/logo.jpg" alt="Barbearia Bacelar" width={28} height={28} className="rounded" />
          <div>
            <p className="text-sm font-semibold leading-none">Barbearia Bacelar</p>
            <p className="text-xs text-muted-foreground">{name}</p>
          </div>
        </div>
        {/* Menu com "Trocar perfil" (Profissional / Cliente; o admin também volta para Administrador). */}
        {profileSwitch ? (
          <ProfileMenu name={name ?? "Admin"} email={profile?.email ?? ""} avatarUrl={profile?.avatarUrl ?? null} profileSwitch={profileSwitch} variant="compact" />
        ) : (
          <LogoutButton />
        )}
      </header>
      <ProfessionalNav />
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
