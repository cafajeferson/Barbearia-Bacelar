import Link from "next/link";
import { CalendarCheck, Clock, Crown, DollarSign, Scissors, Search, UserRound } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/lib/format";
import type { ClientReport, ClientSearchResult } from "../client-report";
import { AreaChart, DonutChart, VerticalBars } from "./charts";

const STATUS: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: "Concluído", className: "text-success" },
  SCHEDULED: { label: "Agendado", className: "text-blue-400" },
  CONFIRMED: { label: "Confirmado", className: "text-blue-400" },
  IN_PROGRESS: { label: "Em atendimento", className: "text-primary" },
  NO_SHOW: { label: "Faltou", className: "text-destructive" },
  CANCELLED: { label: "Cancelado", className: "text-muted-foreground" },
};

function Card({ title, sub, className, children }: { title?: string; sub?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm sm:p-5", className)}>
      {title && (
        <div className="mb-4">
          <h2 className="font-semibold">{title}</h2>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function Stat({ label, value, sub, icon: Icon, highlight }: { label: string; value: string; sub?: string; icon: typeof Scissors; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", highlight ? "border-primary/40 bg-gradient-to-br from-primary/20 via-card to-card" : "border-border/60 bg-card/80")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", highlight && "text-primary")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const fmtDay = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Aba "Clientes" de Relatórios: busca o cliente e mostra o dashboard do que
 * ele fez, no intervalo de datas escolhido.
 */
export function ClientReportView({
  basePath,
  q,
  from,
  to,
  results,
  report,
}: {
  basePath: string;
  q: string;
  from: string;
  to: string;
  results: ClientSearchResult;
  report: ClientReport | null;
}) {
  const link = (over: { cliente?: string; q?: string; de?: string; ate?: string }) => {
    const p = new URLSearchParams({ aba: "clientes", de: over.de ?? from, ate: over.ate ?? to });
    const query = over.q ?? q;
    if (query) p.set("q", query);
    const c = over.cliente ?? report?.client.id;
    if (c) p.set("cliente", c);
    return `${basePath}?${p.toString()}`;
  };
  const year = new Date().getFullYear();
  const presets = [
    { label: "30 dias", de: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10) },
    { label: "90 dias", de: new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10) },
    { label: `${year}`, de: `${year}-01-01` },
    { label: "12 meses", de: new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10) },
  ];
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <form action={basePath} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="aba" value="clientes" />
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="mb-1 block text-xs text-muted-foreground">Cliente (nome ou telefone)</span>
          <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar cliente…"
            className="h-10 w-full rounded-full border border-border/60 bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">De</span>
          <input type="date" name="de" defaultValue={from} className="h-10 rounded-full border border-border/60 bg-card px-3 text-sm" />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">Até</span>
          <input type="date" name="ate" defaultValue={to} className="h-10 rounded-full border border-border/60 bg-card px-3 text-sm" />
        </label>
        {report && <input type="hidden" name="cliente" value={report.client.id} />}
        <button type="submit" className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
          Buscar
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Link
            key={p.label}
            href={link({ de: p.de, ate: todayISO })}
            prefetch={false}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              from === p.de && to === todayISO ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:bg-accent",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {!report && (
        <Card title={q ? `Clientes encontrados para “${q}”` : "Clientes"} sub="toque num cliente para abrir o dashboard dele">
          {results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((c) => (
                <li key={c.id}>
                  <Link
                    href={link({ cliente: c.id })}
                    prefetch={false}
                    className="flex items-center gap-3 rounded-xl border border-border/60 p-3 hover:border-primary"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.visits} visita(s){c.lastVisit ? ` · última ${fmtDay(c.lastVisit)}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {report && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                {report.client.name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold">
                  {report.client.name}
                  {report.client.plan && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      <Crown className="h-3 w-3" /> {report.client.plan}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {[report.client.phone, report.client.email].filter(Boolean).join(" · ") || "sem contato"} · cliente desde{" "}
                  {fmtDay(report.client.since)}
                </p>
              </div>
              <Link href={link({ cliente: "" }).replace(/&?cliente=[^&]*/, "")} prefetch={false} className="rounded-full border border-border/60 px-3 py-1.5 text-sm hover:bg-accent">
                Outro cliente
              </Link>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Visitas" value={String(report.kpis.visits)} sub={report.kpis.lastVisit ? `última: ${report.kpis.lastVisit}` : "nenhuma no período"} icon={CalendarCheck} highlight />
            <Stat label="Serviços feitos" value={String(report.kpis.servicesDone)} sub="combo conta cada serviço" icon={Scissors} />
            <Stat label="Total gasto" value={formatBRL(report.kpis.spent)} sub={`ticket médio ${formatBRL(report.kpis.averageTicket)}`} icon={DollarSign} />
            <Stat
              label="Frequência"
              value={report.kpis.avgGapDays !== null ? `a cada ${report.kpis.avgGapDays} dias` : "—"}
              sub={`${report.kpis.noShows} falta(s) · ${report.kpis.cancelled} cancelado(s) · ${report.kpis.upcoming} futuro(s)`}
              icon={Clock}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card title="Visitas por mês" sub="atendimentos concluídos" className="lg:col-span-2">
              <AreaChart points={report.series.map((s) => ({ label: s.label, value: s.visits }))} height={200} />
            </Card>
            <Card title="O que ele faz" sub="serviços mais feitos">
              {report.items.length ? (
                <DonutChart
                  slices={[
                    ...report.items.slice(0, 5).map((i) => ({ label: i.item, value: i.total })),
                    ...(report.items.length > 5 ? [{ label: "Outros", value: report.items.slice(5).reduce((s, i) => s + i.total, 0) }] : []),
                  ]}
                  centerLabel={String(report.kpis.servicesDone)}
                  centerSub="serviços"
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Sem serviços no período</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card title="Serviços" sub="quantas vezes fez cada um" className="lg:col-span-2">
              <ul className="space-y-2">
                {report.items.map((r) => (
                  <li key={r.item} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_3rem]">
                    <span className="truncate font-medium">{r.item}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-secondary">
                      <span className="block h-full rounded-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${Math.max(3, (r.total / (report.items[0]?.total || 1)) * 100)}%` }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{r.total}</span>
                  </li>
                ))}
                {report.items.length === 0 && <li className="text-sm text-muted-foreground">Nenhum serviço concluído no período.</li>}
              </ul>
            </Card>
            <Card title="Com quem atende" sub="atendimentos por colaborador">
              <VerticalBars bars={report.professionals.map((p) => ({ label: p.name.split(" ")[0], value: p.total }))} height={180} />
            </Card>
          </div>

          <Card title="Histórico" sub={`${report.history.length} agendamento(s) no período`}>
            <div className="-mx-4 sm:-mx-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Serviços</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {h.date} <span className="text-muted-foreground">{h.time}</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {h.services}
                        {h.products && <span className="block text-xs text-muted-foreground">produtos: {h.products}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{h.professional}</TableCell>
                      <TableCell className={cn("whitespace-nowrap text-sm", STATUS[h.status]?.className)}>
                        {STATUS[h.status]?.label ?? h.status}
                        {h.walkIn && <span className="ml-1 text-[10px] text-muted-foreground">sem hora</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {h.total === 0 && h.status === "COMPLETED" ? <span className="text-xs text-success">plano</span> : formatBRL(h.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
