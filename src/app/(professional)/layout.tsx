import { redirect } from "next/navigation";
import Image from "next/image";
import { getAuthContext, getCurrentUserName, getRoleSwitch } from "@/server/auth/getAuthContext";
import { RoleSwitchButton } from "@/shared/components/role-switch-button";
import { LogoutButton } from "@/shared/components/logout-button";
import { ProfessionalNav } from "@/shared/components/professional-nav";

export default async function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  // Admin fora do "modo colaborador" que caiu numa rota de profissional.
  if (ctx.role === "ADMIN") redirect("/dashboard");
  if (ctx.role !== "PROFESSIONAL") redirect("/login");
  const name = await getCurrentUserName();
  const isAdminActing = (await getRoleSwitch())?.mode === "colaborador";

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
        <div className="flex items-center gap-1">
          {isAdminActing && <RoleSwitchButton to="admin" />}
          <LogoutButton />
        </div>
      </header>
      <ProfessionalNav />
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
