import { Clock, CheckCircle2, Wallet, UserRound, Check } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listClientSubscriptions, getSubscriptionSummary } from "@/features/subscriptions/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchBox } from "@/shared/components/search-box";
import { ManagePlansDialog } from "@/features/subscriptions/components/manage-plans-dialog";
import { NewSubscriptionDialog } from "@/features/subscriptions/components/new-subscription-dialog";
import { SubscriptionActions } from "@/features/subscriptions/components/subscription-actions";
import { RefreshButton } from "@/features/subscriptions/components/refresh-button";
import { StatusFilter } from "@/features/subscriptions/components/status-filter";
import { formatBRL, formatPercent } from "@/shared/lib/format";

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
          <h1 className="text-2xl font-semibold">Assinaturas ({subs.length})</h1>
          <p className="text-muted-foreground">Gerencie as assinaturas dos clientes</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton />
          <ManagePlansDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Pendentes</p>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-semibold">{summary.pending}</p>
          <p className="text-xs text-muted-foreground">aguardando aprovação</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Ativas</p>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-semibold">{summary.activeCount}</p>
          <p className="text-xs text-muted-foreground">{formatPercent(summary.activePct)} do total</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Receita Mensal</p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-semibold">{formatBRL(summary.monthlyRevenue)}</p>
          <p className="text-xs text-muted-foreground">estimada</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Buscar por cliente ou plano..." />
        <StatusFilter />
        <div className="ml-auto">
          <NewSubscriptionDialog />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.client.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.client.email ?? s.client.phone}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{s.plan.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBRL(Number(s.plan.priceMonthly))}/mensal
                    {s.nextBillingDate && ` · Próx: ${new Intl.DateTimeFormat("pt-BR").format(s.nextBillingDate)}`}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant={s.status === "ACTIVE" ? "default" : s.status === "PENDING" ? "outline" : "secondary"}>
                    {s.status === "ACTIVE" && <Check className="mr-1 h-3 w-3" />}
                    {STATUS_LABEL[s.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-semibold">{s.creditsUsedThisPeriod}</span>
                  <span className="text-muted-foreground"> /{s.plan.creditLimitPerMonth}</span>
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
