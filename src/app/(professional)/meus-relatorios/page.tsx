import { getAuthContext } from "@/server/auth/getAuthContext";
import { getServiceReport } from "@/features/reports/service";
import { ServiceReportView, parseReportParams } from "@/features/reports/components/service-report-view";

/** Relatórios do profissional: sempre só os próprios serviços (forçado no service + RLS). */
export default async function MeusRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; data?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "PROFESSIONAL") return null;

  const { period, dateISO, ref } = parseReportParams(await searchParams);
  const report = await getServiceReport({ ctx, period, ref });

  return <ServiceReportView report={report} basePath="/meus-relatorios" dateISO={dateISO} showProfessionalFilter={false} />;
}
