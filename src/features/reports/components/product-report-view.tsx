import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, DollarSign, Package, Search, ShoppingBag, Users, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/lib/format";
import type { ReportPeriod } from "../service";
import type { ProductReport } from "../product-report";
import { AreaChart, DonutChart, VerticalBars } from "./charts";

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "dia", label: "Dia" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
];

function shift(dateISO: string, period: ReportPeriod, direction: 1 | -1) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const next =
    period === "dia"
      ? new Date(Date.UTC(y, m - 1, d + direction))
      : period === "semana"
        ? new Date(Date.UTC(y, m - 1, d + 7 * direction))
        : new Date(Date.UTC(y, m - 1 + direction, 1));
  return next.toISOString().slice(0, 10);
}

function title(r: ProductReport) {
  const s = new Date(`${r.start}T00:00:00Z`);
  const e = new Date(`${r.endInclusive}T00:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...o }).format(d);
  if (r.period === "dia") return f({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, s);
  if (r.period === "mes") return f({ month: "long", year: "numeric" }, s);
  return `${f({ day: "2-digit", month: "2-digit" }, s)} a ${f({ day: "2-digit", month: "2-digit", year: "numeric" }, e)}`;
}

function Panel({ title, sub, className, children }: { title: string; sub?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-4">
        <h2 className="font-semibold">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, delta, sub, icon: Icon, highlight }: { label: string; value: string; delta?: number | null; sub?: string; icon: typeof Package; highlight?: boolean }) {
  const up = delta != null && delta >= 0;
  return (
    <div className={cn("rounded-2xl border p-4 sm:p-5", highlight ? "border-primary/40 bg-gradient-to-br from-primary/20 via-card to-card" : "border-border/60 bg-card/80")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight sm:text-3xl", highlight && "text-primary")}>{value}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
        {delta != null && (
          <span className={cn("flex items-center font-medium", up ? "text-success" : "text-destructive")}>
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        <span className="text-muted-foreground">{delta != null ? "vs período anterior" : sub}</span>
      </p>
    </div>
  );
}

/** Aba "Produtos" de Relatórios: o que os clientes compraram, com quem e quando. */
export function ProductReportView({
  report,
  basePath,
  dateISO,
  showProfessionalFilter,
}: {
  report: ProductReport;
  basePath: string;
  dateISO: string;
  showProfessionalFilter: boolean;
}) {
  const href = (over: { periodo?: ReportPeriod; data?: string; prof?: string | null; q?: string | null }) => {
    const p = new URLSearchParams({ aba: "produtos" });
    p.set("periodo", over.periodo ?? report.period);
    p.set("data", over.data ?? dateISO);
    const prof = over.prof === undefined ? report.professionalId : over.prof;
    if (showProfessionalFilter && prof) p.set("prof", prof);
    const q = over.q === undefined ? report.query : over.q;
    if (q) p.set("q", q);
    return `${basePath}?${p.toString()}`;
  };
  const chip = (active: boolean) =>
    cn("whitespace-nowrap rounded-full border px-3 py-1 text-sm", active ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:bg-accent");
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const top = report.products.slice(0, 5);
  const rest = report.products.slice(5).reduce((s, p) => s + p.units, 0);
  const maxUnits = report.products[0]?.units ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border border-border/60 bg-card p-1">
            {PERIODS.map((p) => (
              <Link key={p.value} href={href({ periodo: p.value })} prefetch={false} className={cn("rounded-full px-4 py-1.5 text-sm font-medium", report.period === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
                {p.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Link href={href({ data: shift(dateISO, report.period, -1) })} prefetch={false} className="rounded-full border border-border/60 p-2 hover:bg-accent" aria-label="Período anterior">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="px-2 text-sm font-medium first-letter:uppercase">{title(report)}</span>
            <Link href={href({ data: shift(dateISO, report.period, 1) })} prefetch={false} className="rounded-full border border-border/60 p-2 hover:bg-accent" aria-label="Próximo período">
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link href={href({ data: todayISO })} prefetch={false} className="ml-1 rounded-full border border-border/60 px-3 py-1.5 text-sm hover:bg-accent">
              Hoje
            </Link>
          </div>
        </div>
        <form action={basePath} className="flex w-full items-center gap-2 sm:w-auto">
          <input type="hidden" name="aba" value="produtos" />
          <input type="hidden" name="periodo" value={report.period} />
          <input type="hidden" name="data" value={dateISO} />
          {showProfessionalFilter && report.professionalId && <input type="hidden" name="prof" value={report.professionalId} />}
          <label className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" defaultValue={report.query} placeholder="Buscar cliente ou produto…" className="h-10 w-full rounded-full border border-border/60 bg-card pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </label>
          <button type="submit" className="h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
            Buscar
          </button>
        </form>
      </div>

      {showProfessionalFilter && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-xs font-semibold tracking-wider text-muted-foreground">COLABORADOR</span>
          <Link href={href({ prof: null })} prefetch={false} className={chip(!report.professionalId)}>
            Todos
          </Link>
          {report.professionals.map((p) => (
            <Link key={p.id} href={href({ prof: p.id })} prefetch={false} className={chip(report.professionalId === p.id)}>
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {report.query && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm">
          <Search className="h-4 w-4 text-primary" /> Mostrando só <span className="font-semibold">“{report.query}”</span>
          <Link href={href({ q: null })} prefetch={false} className="ml-auto flex items-center gap-1 text-primary hover:underline">
            <X className="h-3.5 w-3.5" /> limpar busca
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Unidades vendidas" value={String(report.kpis.units)} delta={report.deltas.units} icon={Package} highlight />
        <Kpi label="Faturamento produtos" value={formatBRL(report.kpis.revenue)} delta={report.deltas.revenue} icon={DollarSign} />
        <Kpi label="Clientes que compraram" value={String(report.kpis.buyers)} sub="no período" icon={Users} />
        <Kpi label="Gasto médio" value={formatBRL(report.kpis.averagePerBuyer)} sub="por cliente comprador" icon={ShoppingBag} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Unidades vendidas" sub={report.period === "dia" ? "por hora do dia" : "dia a dia no período"} className="lg:col-span-2">
          <AreaChart points={report.series.map((s) => ({ label: s.label, value: s.units }))} />
        </Panel>
        <Panel title="Mais vendidos" sub="participação em unidades">
          {top.length ? (
            <DonutChart slices={[...top.map((p) => ({ label: p.name, value: p.units })), ...(rest ? [{ label: "Outros", value: rest }] : [])]} centerLabel={String(report.kpis.units)} centerSub="unidades" />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma venda no período</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Ranking de produtos" sub="toque num produto para ver quem comprou" className="lg:col-span-2">
          {report.products.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum produto vendido neste período.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {report.products.map((p) => (
                <li key={p.name}>
                  <details className="group py-2">
                    <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,13rem)_1fr_auto]">
                      <span className="truncate font-medium group-open:text-primary" title={p.name}>
                        {p.name}
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-secondary">
                        <span className="block h-full rounded-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${Math.max(3, (p.units / maxUnits) * 100)}%` }} />
                      </span>
                      <span className="whitespace-nowrap text-right tabular-nums">
                        <span className="font-semibold">{p.units} un.</span> <span className="text-xs text-muted-foreground">{formatBRL(p.revenue)}</span>
                      </span>
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
                      {p.clients.map((c) => (
                        <Link key={c.name} href={href({ q: c.name })} prefetch={false} className="rounded-full border border-border/60 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                          {c.name}
                          {c.count > 1 ? ` ×${c.count}` : ""}
                        </Link>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Por colaborador" sub="unidades saídas nos atendimentos">
          <VerticalBars bars={report.byProfessional.map((b) => ({ label: b.name.split(" ")[0], value: b.units }))} height={190} />
        </Panel>
      </div>

      <Panel title="Compras" sub={`${report.purchases.length} no período`}>
        {report.purchases.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma compra.</p>
        ) : (
          <div className="-mx-4 sm:-mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto</TableHead>
                  {showProfessionalFilter && <TableHead>Colaborador</TableHead>}
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.purchases.slice(0, 80).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {p.date} <span className="text-muted-foreground">{p.time}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={href({ q: p.client })} prefetch={false} className="font-medium hover:text-primary">
                        {p.client}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{p.product}</TableCell>
                    {showProfessionalFilter && <TableCell className="whitespace-nowrap text-sm">{p.professional}</TableCell>}
                    <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatBRL(p.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  );
}
