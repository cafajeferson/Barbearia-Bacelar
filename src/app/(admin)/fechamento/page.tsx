import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { getMonthClosing } from "@/features/closing/service";
import {
  ClosingExportButtons,
  PayAllButton,
  PayProfessionalButton,
} from "@/features/closing/components/closing-actions";
import { RecalculateButton } from "@/features/commissions/components/recalculate-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/shared/lib/format";

/** "YYYY-MM" do filtro de período; sem filtro, o mês passado (é o que normalmente se fecha). */
function resolveMonth(period: string | undefined): Date {
  const match = period?.match(/^(\d{4})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, 1);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

function ChecklistItem({ ok, children, href }: { ok: boolean; children: React.ReactNode; href?: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        )}
        <span className={ok ? "text-muted-foreground" : "font-medium"}>{children}</span>
      </span>
      {!ok && href && (
        <Link href={href} prefetch={false} className="text-xs font-medium text-primary hover:underline print:hidden">
          Resolver
        </Link>
      )}
    </li>
  );
}

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; unit?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { period, unit } = await searchParams;
  const periodMonth = resolveMonth(period);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthSlug = `${periodMonth.getFullYear()}-${pad(periodMonth.getMonth() + 1)}`;
  const periodMonthISO = `${monthSlug}-01`;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(periodMonth);

  const data = await getMonthClosing({ ctx, periodMonth, unitId: unit || undefined });
  const { totals, checklist } = data;
  const totalMonth = totals.services + totals.products + totals.subscriptions;
  const commissionsCalculated = checklist.hasCommissionEntries || totals.attendances === 0;

  return (
    <main className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fechamento do mês</h1>
          <p className="text-muted-foreground">
            {monthLabel} · {unit ? "unidade selecionada" : "todas as unidades"} · troque o mês no filtro de período
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <RecalculateButton periodMonth={periodMonthISO} />
          <ClosingExportButtons rows={data.rows} monthLabel={monthLabel} fileSlug={monthSlug} />
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 text-warning" /> Antes de fechar o mês
        </h2>
        <ul className="space-y-2">
          <ChecklistItem ok={checklist.openAppointments === 0} href="/em-aberto">
            {checklist.openAppointments === 0
              ? "Nenhum atendimento em aberto"
              : `${checklist.openAppointments} atendimento(s) do mês sem fechamento — não entram nos valores abaixo`}
          </ChecklistItem>
          <ChecklistItem ok={commissionsCalculated}>
            {commissionsCalculated
              ? "Comissões do mês calculadas"
              : "Comissões ainda não calculadas — clique em Recalcular"}
          </ChecklistItem>
          <ChecklistItem ok={checklist.overdueSubscriptions === 0} href="/assinaturas">
            {checklist.overdueSubscriptions === 0
              ? "Nenhuma assinatura com cobrança vencida"
              : `${checklist.overdueSubscriptions} assinatura(s) com cobrança vencida`}
          </ChecklistItem>
          <ChecklistItem ok={totals.pending === 0} href="/comissoes">
            {totals.pending === 0
              ? "Nenhuma comissão a pagar"
              : `Comissões a pagar do mês: ${formatBRL(totals.pending)} (${checklist.pendingCommissionProfessionals} profissional(is))`}
          </ChecklistItem>
        </ul>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Serviços</p>
          <p className="text-xl font-semibold">{formatBRL(totals.services)}</p>
          <p className="text-xs text-muted-foreground">{totals.attendances} atendimento(s) concluído(s)</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Produtos</p>
          <p className="text-xl font-semibold">{formatBRL(totals.products)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Assinaturas</p>
          <p className="text-xl font-semibold">{formatBRL(totals.subscriptions)}</p>
          <p className="text-xs text-muted-foreground">{checklist.activeSubscriptions} ativa(s), mensalidades somadas</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total do mês</p>
          <p className="text-xl font-semibold text-primary">{formatBRL(totalMonth)}</p>
          <p className="text-xs text-muted-foreground">serviços + produtos + assinaturas</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Por barbeiro</h2>
          <p className="text-xs text-muted-foreground">Comissão pela data do atendimento.</p>
        </div>
        <PayAllButton periodMonth={periodMonthISO} disabled={totals.pending === 0} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Barbeiro</TableHead>
              <TableHead className="text-right">Atend.</TableHead>
              <TableHead className="text-right">Serviços</TableHead>
              <TableHead className="text-right">Produtos</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead className="text-right">Assinatura</TableHead>
              <TableHead className="text-right">Já pago</TableHead>
              <TableHead className="text-right">A pagar</TableHead>
              <TableHead className="w-36 print:hidden" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Nenhum profissional com movimento neste mês.
                </TableCell>
              </TableRow>
            )}
            {data.rows.map((r) => (
              <TableRow key={r.professionalId}>
                <TableCell className="whitespace-nowrap font-medium">
                  {r.name}
                  {!r.active && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(ex-profissional)</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {r.attendances}
                  {r.openAttendances > 0 && (
                    <span className="block text-xs text-warning">+{r.openAttendances} em aberto</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">{formatBRL(r.services)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{formatBRL(r.products)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{formatBRL(r.commission)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{formatBRL(r.subscription)}</TableCell>
                <TableCell className="whitespace-nowrap text-right text-success">{formatBRL(r.paid)}</TableCell>
                <TableCell className="whitespace-nowrap text-right font-semibold">{formatBRL(r.pending)}</TableCell>
                <TableCell className="text-right print:hidden">
                  {r.pending > 0 && (
                    <PayProfessionalButton periodMonth={periodMonthISO} professionalId={r.professionalId} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-right text-sm text-muted-foreground">
        Comissões: <span className="font-medium text-foreground">{formatBRL(totals.commission)}</span> · Assinatura:{" "}
        <span className="font-medium text-foreground">{formatBRL(totals.subscriptionCommission)}</span> · Já pago:{" "}
        <span className="font-medium text-foreground">{formatBRL(totals.paid)}</span> · A pagar:{" "}
        <span className="font-semibold text-primary">{formatBRL(totals.pending)}</span>
      </p>
    </main>
  );
}
