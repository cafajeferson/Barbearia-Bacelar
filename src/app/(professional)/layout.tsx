import { redirect } from "next/navigation";
import Image from "next/image";
import { getAuthContext, getCurrentUserName } from "@/server/auth/getAuthContext";
import { LogoutButton } from "@/shared/components/logout-button";

export default async function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "PROFESSIONAL") {
    redirect("/login");
  }
  const name = await getCurrentUserName();

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
        <LogoutButton />
      </header>
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
