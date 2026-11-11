import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { getServiceReport } from "../service";
import { getClientReport, searchClients } from "../client-report";
import { getProductReport } from "../product-report";
import { ServiceReportView, parseReportParams } from "./service-report-view";
import { ClientReportView } from "./client-report-view";
import { ProductReportView } from "./product-report-view";
import { ReportTabs, parseTab } from "./report-tabs";

export type ReportsSearchParams = {
  aba?: string;
  periodo?: string;
  data?: string;
  prof?: string;
  q?: string;
  cliente?: string;
  de?: string;
  ate?: string;
};

const isoDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/**
 * Página de Relatórios com as três abas. Mesma página para o admin
 * (/relatorios, com filtro de colaborador) e para o profissional
 * (/meus-relatorios, só os próprios dados — forçado em cada service).
 */
export async function ReportsPage({
  ctx,
  sp,
  basePath,
  isAdmin,
}: {
  ctx: AuthenticatedContext;
  sp: ReportsSearchParams;
  basePath: string;
  isAdmin: boolean;
}) {
  const tab = parseTab(sp.aba);
  const tabs = <ReportTabs basePath={basePath} active={tab} />;
  const { period, dateISO, ref, q } = parseReportParams(sp);
  const professionalId = isAdmin ? sp.prof || undefined : undefined;

  if (tab === "servicos") {
    const report = await getServiceReport({ ctx, period, ref, professionalId, q });
    return <ServiceReportView report={report} basePath={basePath} dateISO={dateISO} showProfessionalFilter={isAdmin} tabs={tabs} />;
  }

  const header = (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
      <p className="text-sm text-muted-foreground">
        {tab === "clientes" ? "Tudo que cada cliente fez, no período que você escolher" : "Produtos comprados pelos clientes"}
      </p>
    </div>
  );

  if (tab === "produtos") {
    const report = await getProductReport({ ctx, period, ref, professionalId, q });
    return (
      <main className="space-y-4 p-3 sm:p-6">
        {header}
        {tabs}
        <ProductReportView report={report} basePath={basePath} dateISO={dateISO} showProfessionalFilter={isAdmin} />
      </main>
    );
  }

  // Clientes: padrão = últimos 12 meses até hoje.
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const to = isoDate(sp.ate) ?? todayISO;
  const from = isoDate(sp.de) ?? new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const [results, report] = await Promise.all([
    sp.cliente ? Promise.resolve([]) : searchClients({ ctx, q: sp.q ?? "" }),
    sp.cliente ? getClientReport({ ctx, clientId: sp.cliente, from: toUtc(from), to: toUtc(to) }) : Promise.resolve(null),
  ]);
  return (
    <main className="space-y-4 p-3 sm:p-6">
      {header}
      {tabs}
      <ClientReportView basePath={basePath} q={sp.q ?? ""} from={from} to={to} results={results} report={report} />
    </main>
  );
}
