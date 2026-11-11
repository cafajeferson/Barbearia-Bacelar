import { getAuthContext } from "@/server/auth/getAuthContext";
import { ReportsPage, type ReportsSearchParams } from "@/features/reports/components/reports-page";

/** Relatórios do profissional: sempre só os próprios dados (forçado nos services + RLS). */
export default async function MeusRelatoriosPage({ searchParams }: { searchParams: Promise<ReportsSearchParams> }) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "PROFESSIONAL") return null;
  return <ReportsPage ctx={ctx} sp={await searchParams} basePath="/meus-relatorios" isAdmin={false} />;
}
