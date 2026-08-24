import { redirect } from "next/navigation";
import { getAuthContext, getCurrentUserName } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { AdminSidebar } from "@/shared/components/admin-sidebar";
import { AdminTopbar } from "@/shared/components/admin-topbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "ADMIN") {
    redirect("/login");
  }
  // Sequencial, não Promise.all: getCurrentUserName() reaproveita a mesma
  // transação já cacheada do getAuthContext() acima (mesmo request) — rodar
  // em paralelo com a consulta de units só arriscaria abrir conexão nova à
  // toa, sem ganhar tempo real (visto o pooler do Supabase já ter recusado
  // transação por excesso de conexões simultâneas nessa página).
  const name = await getCurrentUserName();
  const units = await withAppContext(ctx, (tx) =>
    tx.unit.findMany({ where: { active: true }, select: { id: true, name: true, address: true } }),
  );

  return (
    <div className="flex min-h-screen">
      <AdminSidebar userName={name ?? "Admin"} userRole="Administrador" />
      <div className="flex-1 overflow-x-hidden">
        <AdminTopbar units={units} />
        {children}
      </div>
    </div>
  );
}
