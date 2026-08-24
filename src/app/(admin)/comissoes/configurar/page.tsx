import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listServicesForCommissionConfig } from "@/features/commissions/service";
import { ServiceCommissionConfig } from "@/features/commissions/components/service-commission-config";

export default async function ConfigurarComissoesPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { sections, defaultCommissionServicePct, defaultCommissionWalkInPct } =
    await listServicesForCommissionConfig({ ctx });

  const sectionsForClient = sections.map((s) => ({
    id: s.id,
    name: s.name,
    services: s.services.map((sv) => ({
      id: sv.id,
      name: sv.name,
      commissionServicePct: sv.commissionServicePct != null ? Number(sv.commissionServicePct) : null,
      commissionWalkInPct: sv.commissionWalkInPct != null ? Number(sv.commissionWalkInPct) : null,
    })),
  }));

  return (
    <main className="space-y-4 p-6">
      <div>
        <Link
          href="/comissoes"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <h1 className="text-2xl font-semibold">Configurar Comissões</h1>
        <p className="text-muted-foreground">Defina como o faturamento é dividido entre a barbearia e os profissionais</p>
      </div>

      <ServiceCommissionConfig
        sections={sectionsForClient}
        defaultServicePct={defaultCommissionServicePct}
        defaultWalkInPct={defaultCommissionWalkInPct}
      />
    </main>
  );
}
