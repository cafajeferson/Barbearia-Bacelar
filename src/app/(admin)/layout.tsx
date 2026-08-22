import { redirect } from "next/navigation";
import { getAuthContext, getCurrentUserName } from "@/server/auth/getAuthContext";
import { AdminSidebar } from "@/shared/components/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "ADMIN") {
    redirect("/login");
  }
  const name = await getCurrentUserName();

  return (
    <div className="flex min-h-screen">
      <AdminSidebar userName={name ?? "Admin"} userRole="Administrador" />
      <div className="flex-1 overflow-x-hidden">{children}</div>
    </div>
  );
}
