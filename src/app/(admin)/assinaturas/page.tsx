import Link from "next/link";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listClientSubscriptions, getSubscriptionSummary } from "@/features/subscriptions/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchBox } from "@/shared/components/search-box";
import { ManagePlansDialog } from "@/features/subscriptions/components/manage-plans-dialog";
import { NewSubscriptionDialog } from "@/features/subscriptions/components/new-subscription-dialog";
import { SubscriptionActions } from "@/features/subscriptions/components/subscription-actions";
import { formatBRL, formatPercent } from "@/shared/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

export default async function AssinaturasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { search, status } = await searchParams;

  const [subs, summary] = await Promise.all([
    listClientSubscriptions({
      ctx,
      search,
      status: status as "PENDING" | "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED" | undefined,
    }),
    getSubscriptionSummary({ ctx }),
  ]);

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Assinaturas</h1>
          <p className="text-muted-foreground">Planos recorrentes de clientes</p>
        </div>
        <div className="flex gap-2">
          <ManagePlansDialog />
          <NewSubscriptionDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Pendentes</p>
          <p className="text-2xl font-semibold">{summary.pending}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Ativas</p>
          <p className="text-2xl font-semibold">
            {summary.activeCount}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({formatPercent(summary.activePct)})
            </span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Receita Mensal</p>
          <p className="text-2xl font-semibold">{formatBRL(summary.monthlyRevenue)}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Buscar cliente" />
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <Link
            key={key}
            href={`/assinaturas?${new URLSearchParams({ ...(search ? { search } : {}), status: status === key ? "" : key }).toString()}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              status === key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uso</TableHead>
              <TableHead>Próxima cobrança</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <p className="font-medium">{s.client.name}</p>
                  <p className="text-xs text-muted-foreground">{s.client.email ?? s.client.phone}</p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{s.plan.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.plan.services.map((ps) => ps.service.name).join(" + ")} ·{" "}
                    {formatBRL(Number(s.plan.priceMonthly))}/mês
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant={s.status === "ACTIVE" ? "default" : s.status === "PENDING" ? "outline" : "secondary"}>
                    {STATUS_LABEL[s.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {s.creditsUsedThisPeriod}/{s.plan.creditLimitPerMonth}
                </TableCell>
                <TableCell>
                  {s.nextBillingDate
                    ? new Intl.DateTimeFormat("pt-BR").format(s.nextBillingDate)
                    : "—"}
                </TableCell>
                <TableCell>
                  <SubscriptionActions subscriptionId={s.id} status={s.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
