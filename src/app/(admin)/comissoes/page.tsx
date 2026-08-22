import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listServiceCommissions, listSubscriptionCommissions } from "@/features/commissions/service";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecalculateButton } from "@/features/commissions/components/recalculate-button";
import { ProfessionalCommissionRow } from "@/features/commissions/components/professional-commission-row";
import { formatBRL } from "@/shared/lib/format";

function parseMonthParam(value: string | undefined): Date {
  if (!value) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const [y, m] = value.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function toMonthParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { month } = await searchParams;
  const periodMonth = parseMonthParam(month);
  const periodMonthISO = periodMonth.toISOString().slice(0, 10);

  const prevMonth = new Date(periodMonth.getFullYear(), periodMonth.getMonth() - 1, 1);
  const nextMonth = new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 1);

  const [serviceCommissions, subscriptionCommissions] = await Promise.all([
    listServiceCommissions({ ctx, periodMonth }),
    listSubscriptionCommissions({ ctx, periodMonth }),
  ]);

  const serviceTotal = serviceCommissions.reduce((s, c) => s + c.pending + c.paid, 0);
  const serviceAttendances = serviceCommissions.reduce((s, c) => s + c.entries.length, 0);
  const subscriptionTotal = subscriptionCommissions.reduce((s, c) => s + c.pending + c.paid, 0);
  const subscriptionAttendances = subscriptionCommissions.reduce((s, c) => s + c.entries.length, 0);

  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(periodMonth);

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Comissões</h1>
          <p className="text-muted-foreground">Apuração no 1º do mês seguinte</p>
        </div>
        <RecalculateButton periodMonth={periodMonthISO} />
      </div>

      <div className="flex items-center justify-center gap-4">
        <Link href={`/comissoes?month=${toMonthParam(prevMonth)}`} className="rounded-md border p-1.5 hover:bg-accent">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-40 text-center font-medium capitalize">{monthLabel}</span>
        <Link href={`/comissoes?month=${toMonthParam(nextMonth)}`} className="rounded-md border p-1.5 hover:bg-accent">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <Tabs defaultValue="servicos">
        <TabsList>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="assinaturas">Assinaturas</TabsTrigger>
        </TabsList>

        <TabsContent value="servicos" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Total geral</p>
              <p className="text-2xl font-semibold">{formatBRL(serviceTotal)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Atendimentos</p>
              <p className="text-2xl font-semibold">{serviceAttendances}</p>
            </Card>
          </div>
          <Card className="p-0">
            <h2 className="border-b px-4 py-3 font-semibold">Comissões por Profissional</h2>
            {serviceCommissions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum atendimento concluído neste mês.</p>
            ) : (
              serviceCommissions.map((c) => (
                <ProfessionalCommissionRow
                  key={c.professionalId}
                  professionalId={c.professionalId}
                  name={c.name}
                  pending={c.pending}
                  paid={c.paid}
                  entries={c.entries}
                  periodMonth={periodMonthISO}
                  type="SERVICE"
                />
              ))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="assinaturas" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Total geral</p>
              <p className="text-2xl font-semibold">{formatBRL(subscriptionTotal)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Atendimentos cobertos</p>
              <p className="text-2xl font-semibold">{subscriptionAttendances}</p>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">
            Fórmula: (receita das assinaturas ativas / 2) / total de atendimentos cobertos × atendimentos do
            profissional.
          </p>
          <Card className="p-0">
            <h2 className="border-b px-4 py-3 font-semibold">Comissões por Profissional</h2>
            {subscriptionCommissions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Nenhum atendimento coberto por assinatura neste mês.
              </p>
            ) : (
              subscriptionCommissions.map((c) => (
                <ProfessionalCommissionRow
                  key={c.professionalId}
                  professionalId={c.professionalId}
                  name={c.name}
                  pending={c.pending}
                  paid={c.paid}
                  entries={c.entries}
                  periodMonth={periodMonthISO}
                  type="SUBSCRIPTION"
                />
              ))
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
