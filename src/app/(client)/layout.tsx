import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { ClientNav } from "@/shared/components/client-nav";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "CLIENT") {
    redirect("/login");
  }

  const unit = await withAppContext({ role: "ADMIN", userId: null }, (tx) => tx.unit.findFirst());

  return (
    <div className="min-h-screen bg-background">
      <ClientNav unitName={unit?.name ?? "Bacelar"} />
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
