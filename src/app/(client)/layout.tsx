import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { ClientNav, ClientBottomNav } from "@/shared/components/client-nav";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "CLIENT") {
    redirect("/login");
  }

  const unit = await withAppContext({ role: "ADMIN", userId: null }, (tx) => tx.unit.findFirst());

  return (
    <div className="min-h-screen bg-background">
      <ClientNav unitName={unit?.name ?? "Bacelar"} />
      {/* pb generoso pra conteúdo nunca ficar embaixo da barra fixa — a
          barra em si tem uns 64px de altura, + até ~34px de
          safe-area-inset-bottom em iPhones com home indicator; 7rem
          (112px) cobre isso com folga em qualquer aparelho. */}
      <div className="mx-auto max-w-3xl pb-28">{children}</div>
      <ClientBottomNav />
    </div>
  );
}
