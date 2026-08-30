import { redirect } from "next/navigation";
import { getAuthContext, getCurrentUserProfile } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { ttlCached } from "@/server/db/ttl-cache";
import { ClientNav, ClientBottomNav } from "@/shared/components/client-nav";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  // As três são independentes entre si — rodar em paralelo corta o tempo
  // de rede desse layout, que roda em toda página do app do cliente. No
  // raro caso de sessão inválida, unit/profile acabam sendo buscados à
  // toa (dado não sensível, sem problema). A unidade fica 60s em cache
  // de memória: muda raramente e custava uma transação por navegação.
  const [ctx, unit, profile] = await Promise.all([
    getAuthContext(),
    ttlCached("client-layout:unit", 60_000, () =>
      withAppContext({ role: "ADMIN", userId: null }, (tx) => tx.unit.findFirst()),
    ),
    getCurrentUserProfile(),
  ]);
  if (!ctx || ctx.role !== "CLIENT") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <ClientNav
        unitName={unit?.name ?? "Bacelar"}
        userName={profile?.name ?? null}
        userEmail={profile?.email ?? ""}
      />
      {/* pb generoso pra conteúdo nunca ficar embaixo da barra fixa — a
          barra em si tem uns 64px de altura, + até ~34px de
          safe-area-inset-bottom em iPhones com home indicator; 7rem
          (112px) cobre isso com folga em qualquer aparelho. */}
      <div className="mx-auto max-w-3xl pb-28">{children}</div>
      <ClientBottomNav />
    </div>
  );
}
