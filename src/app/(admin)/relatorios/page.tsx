import { getAuthContext } from "@/server/auth/getAuthContext";
import { ReportsPage, type ReportsSearchParams } from "@/features/reports/components/reports-page";

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<ReportsSearchParams> }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "ADMIN") return null;
  return <ReportsPage ctx={ctx} sp={await searchParams} basePath="/relatorios" isAdmin />;
}
