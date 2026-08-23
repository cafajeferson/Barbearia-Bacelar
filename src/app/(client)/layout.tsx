import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { ClientNav, ClientBottomNav } from "@/shared/components/client-nav";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  // As duas são independentes (unit não depende de ctx) — rodar em paralelo
  // corta pela metade o tempo de rede desse layout, que roda em toda
  // página do app do cliente. No raro caso de sessão inválida, a consulta
  // de unit acaba sendo feita à toa (dado não sensível, sem problema).
  const [ctx, unit] = await Promise.all([
    getAuthContext(),
    withAppContext({ role: "ADMIN", userId: null }, (tx) => tx.unit.findFirst()),
  ]);
  if (!ctx || ctx.role !== "CLIENT") {
    redirect("/login");
  }

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
