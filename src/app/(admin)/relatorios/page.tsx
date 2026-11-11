import { getAuthContext } from "@/server/auth/getAuthContext";
import { getServiceReport } from "@/features/reports/service";
import { ServiceReportView, parseReportParams } from "@/features/reports/components/service-report-view";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; data?: string; prof?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const { period, dateISO, ref } = parseReportParams(sp);
  const report = await getServiceReport({ ctx, period, ref, professionalId: sp.prof || undefined });

  return <ServiceReportView report={report} basePath="/relatorios" dateISO={dateISO} showProfessionalFilter />;
}
