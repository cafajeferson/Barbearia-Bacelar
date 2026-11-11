import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  DollarSign,
  Receipt,
  Scissors,
  Search,
  X,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/lib/format";
import type { ReportPeriod, ServiceReport } from "../service";
import { AreaChart, DonutChart, VerticalBars } from "./charts";
import { PeriodControls } from "./period-controls";

const ATTENDANCE_LIMIT = 60;

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

function Kpi({
  label,
  value,
  sub,
  delta,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  delta: number | null;
  icon: typeof Scissors;
  highlight?: boolean;
}) {
  const up = delta !== null && delta >= 0;
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        highlight ? "border-primary/40 bg-gradient-to-br from-primary/20 via-card to-card" : "border-border/60 bg-card/80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight sm:text-3xl", highlight && "text-primary")}>{value}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
        {delta !== null ? (
          <span className={cn("flex items-center font-medium", up ? "text-success" : "text-destructive")}>
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
        <span className="text-muted-foreground">{delta !== null ? "vs período anterior" : sub}</span>
      </p>
      {delta !== null && sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Dashboard de Relatórios — admin (todos ou um colaborador) e profissional
 * (só os próprios). Período, data, colaborador e busca ficam na URL.
 */
export function ServiceReportView({
  report,
  basePath,
  dateISO,
  showProfessionalFilter,
  tabs,
}: {
  report: ServiceReport;
  basePath: string;
  dateISO: string;
  showProfessionalFilter: boolean;
  /** Abas de Relatórios (Serviços / Clientes / Produtos), mostradas logo abaixo do título. */
  tabs?: React.ReactNode;
}) {
  const href = (over: { periodo?: ReportPeriod; data?: string; de?: string; ate?: string; prof?: string | null; q?: string | null }) => {
    const p = new URLSearchParams();
    const periodo = over.periodo ?? report.period;
    p.set("periodo", periodo);
    p.set("data", over.data ?? dateISO);
    if (periodo === "personalizado") {
      p.set("de", over.de ?? report.start);
      p.set("ate", over.ate ?? report.endInclusive);
    }
    const prof = over.prof === undefined ? report.professionalId : over.prof;
    if (showProfessionalFilter && prof) p.set("prof", prof);
    const q = over.q === undefined ? report.query : over.q;
    if (q) p.set("q", q);
    return `${basePath}?${p.toString()}`;
  };
  const chip = (active: boolean) =>
    cn(
      "whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:bg-accent",
    );
  const showByPro = showProfessionalFilter && !report.professionalId && report.professionals.length > 1;
  const top = report.items.slice(0, 5);
  const others = report.items.slice(5).reduce((s, r) => s + r.total, 0);
  const donut = [...top.map((r) => ({ label: r.item, value: r.total })), ...(others ? [{ label: "Outros", value: others }] : [])];
  const maxItem = report.items[0]?.total ?? 1;
  const proBars = report.professionals.map((p) => ({
    label: p.name.split(" ")[0],
    value: report.items.reduce((s, r) => s + (r.byProfessional[p.id] ?? 0), 0),
  }));

  return (
    <main className="space-y-4 p-3 sm:p-6">
      {/* Cabeçalho: título, busca e período */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Serviços realizados · combo conta 1 de cada (“Corte + Barba” = 1 corte e 1 barba)
          </p>
        </div>
        <form action={basePath} className="flex w-full items-center gap-2 sm:w-auto">
          <input type="hidden" name="periodo" value={report.period} />
          <input type="hidden" name="data" value={dateISO} />
          {report.period === "personalizado" && (
            <>
              <input type="hidden" name="de" value={report.start} />
              <input type="hidden" name="ate" value={report.endInclusive} />
            </>
          )}
          {showProfessionalFilter && report.professionalId && <input type="hidden" name="prof" value={report.professionalId} />}
          <label className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={report.query}
              placeholder="Buscar cliente ou serviço…"
              className="h-10 w-full rounded-full border border-border/60 bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <button type="submit" className="h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
            Buscar
          </button>
        </form>
      </div>

      {tabs}

      <PeriodControls
        period={report.period}
        dateISO={dateISO}
        startISO={report.start}
        endISO={report.endInclusive}
        href={href}
        basePath={basePath}
        hidden={{ prof: showProfessionalFilter ? report.professionalId : null, q: report.query || null }}
      />

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

      {report.quickItems.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-xs font-semibold tracking-wider text-muted-foreground">SERVIÇO</span>
          <Link href={href({ q: null })} prefetch={false} className={chip(!report.query)}>
            Todos
          </Link>
          {report.quickItems.map((item) => (
            <Link key={item} href={href({ q: item })} prefetch={false} className={chip(report.query.toLowerCase() === item.toLowerCase())}>
              {item}
            </Link>
          ))}
        </div>
      )}

      {report.query && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm">
          <Search className="h-4 w-4 text-primary" />
          Mostrando só <span className="font-semibold">“{report.query}”</span> (nome do cliente ou serviço)
          <Link href={href({ q: null })} prefetch={false} className="ml-auto flex items-center gap-1 text-primary hover:underline">
            <X className="h-3.5 w-3.5" /> limpar busca
          </Link>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Serviços feitos" value={String(report.kpis.servicesDone)} delta={report.deltas.servicesDone} sub="combo conta cada serviço" icon={Scissors} highlight />
        <Kpi label="Atendimentos" value={String(report.kpis.attendances)} delta={report.deltas.attendances} sub={`${report.kpis.walkIns} sem hora marcada`} icon={CalendarCheck} />
        <Kpi label="Faturamento" value={formatBRL(report.kpis.revenue)} delta={report.deltas.revenue} icon={DollarSign} />
        <Kpi label="Ticket médio" value={formatBRL(report.kpis.averageTicket)} delta={report.deltas.averageTicket} sub="por atendimento" icon={Receipt} />
      </div>

      {/* Evolução + distribuição */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel
          title="Serviços feitos"
          sub={report.period === "dia" ? "por hora do dia" : "dia a dia no período"}
          className="lg:col-span-2"
        >
          <div className="text-foreground">
            <AreaChart points={report.series.map((p) => ({ label: p.label, value: p.services }))} />
          </div>
        </Panel>
        <Panel title="Distribuição" sub="os serviços mais feitos">
          {donut.length ? (
            <DonutChart
              slices={donut}
              centerLabel={String(report.kpis.servicesDone)}
              centerSub="serviços"
              hrefFor={(label) => (label === "Outros" ? null : href({ q: label }))}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Sem dados</p>
          )}
        </Panel>
      </div>

      {/* Ranking com clientes + barras */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Ranking de serviços" sub="toque num serviço para ver quem fez" className="lg:col-span-2">
          {report.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum serviço concluído neste período.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {report.items.map((r) => {
                const clients = report.clientsByItem[r.item] ?? [];
                return (
                  <li key={r.item}>
                    <details className="group py-2">
                      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,13rem)_1fr_3rem]">
                        <span className="truncate font-medium group-open:text-primary" title={r.item}>
                          {r.item}
                        </span>
                        <span className="h-2 overflow-hidden rounded-full bg-secondary">
                          <span className="block h-full rounded-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${Math.max(2, (r.total / maxItem) * 100)}%` }} />
                        </span>
                        <span className="text-right font-semibold tabular-nums">{r.total}</span>
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
                        {clients.map((c) => (
                          <Link
                            key={c.name}
                            href={href({ q: c.name })}
                            prefetch={false}
                            className="rounded-full border border-border/60 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                          >
                            {c.name}
                            {c.count > 1 ? ` ×${c.count}` : ""}
                          </Link>
                        ))}
                        <Link href={href({ q: r.item })} prefetch={false} className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                          ver só {r.item}
                        </Link>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title={showByPro ? "Por colaborador" : "Por dia da semana"} sub="serviços feitos">
          <VerticalBars bars={showByPro ? proBars : report.weekdays.map((w) => ({ label: w.label, value: w.services }))} />
        </Panel>
      </div>

      {/* Atendimentos com nome do cliente */}
      <Panel
        title="Atendimentos"
        sub={
          report.attendances.length > ATTENDANCE_LIMIT
            ? `os ${ATTENDANCE_LIMIT} mais recentes de ${report.attendances.length} — use a busca para filtrar`
            : `${report.attendances.length} no período`
        }
      >
        {report.attendances.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum atendimento.</p>
        ) : (
          <div className="-mx-4 sm:-mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  {showProfessionalFilter && <TableHead>Colaborador</TableHead>}
                  <TableHead>Serviços</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.attendances.slice(0, ATTENDANCE_LIMIT).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {a.date} <span className="text-muted-foreground">{a.time}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={href({ q: a.client })} prefetch={false} className="font-medium hover:text-primary">
                        {a.client}
                      </Link>
                      {a.walkIn && <span className="ml-1 text-[10px] text-muted-foreground">sem hora</span>}
                    </TableCell>
                    {showProfessionalFilter && <TableCell className="whitespace-nowrap text-sm">{a.professional}</TableCell>}
                    <TableCell className="text-sm text-muted-foreground">{a.services}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {a.total === 0 ? <span className="text-xs text-success">plano</span> : formatBRL(a.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      {/* Detalhamento */}
      {report.items.length > 0 && (
        <details className="rounded-2xl border border-border/60 bg-card/80 p-4 sm:p-5" open>
          <summary className="cursor-pointer font-semibold">Detalhamento</summary>
          <div className="mt-4 space-y-5">
            {report.buckets.length > 1 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">{report.period === "mes" ? "Semana a semana" : "Dia a dia"}</h3>
                <div className="rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serviço</TableHead>
                        {report.buckets.map((b) => (
                          <TableHead key={b.key} className="whitespace-nowrap text-right first-letter:uppercase">
                            {b.label}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.items.map((r) => (
                        <TableRow key={r.item}>
                          <TableCell className="whitespace-nowrap font-medium">{r.item}</TableCell>
                          {report.buckets.map((b) => (
                            <TableCell key={b.key} className="text-right tabular-nums">
                              {r.byBucket[b.key] ?? <span className="text-muted-foreground">–</span>}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-semibold tabular-nums">{r.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {showByPro && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Por colaborador</h3>
                <div className="rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serviço</TableHead>
                        {report.professionals.map((p) => (
                          <TableHead key={p.id} className="whitespace-nowrap text-right">
                            {p.name}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.items.map((r) => (
                        <TableRow key={r.item}>
                          <TableCell className="whitespace-nowrap font-medium">{r.item}</TableCell>
                          {report.professionals.map((p) => (
                            <TableCell key={p.id} className="text-right tabular-nums">
                              {r.byProfessional[p.id] ?? <span className="text-muted-foreground">–</span>}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-semibold tabular-nums">{r.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Como foi vendido (itens do catálogo)</h3>
              <div className="rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item vendido</TableHead>
                      <TableHead className="text-right">Vezes</TableHead>
                      <TableHead className="text-right">Valor de tabela</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.catalog.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatBRL(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {report.trend.rows.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Mês a mês (últimos 6 meses)</h3>
                <div className="rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serviço</TableHead>
                        {report.trend.months.map((m) => (
                          <TableHead key={m} className="whitespace-nowrap text-right">
                            {m}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.trend.rows.map((r) => (
                        <TableRow key={r.item}>
                          <TableCell className="whitespace-nowrap font-medium">{r.item}</TableCell>
                          {r.counts.map((n, i) => (
                            <TableCell key={i} className="text-right tabular-nums">
                              {n || <span className="text-muted-foreground">–</span>}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        {report.trend.totals.map((n, i) => (
                          <TableCell key={i} className="text-right font-semibold tabular-nums">
                            {n}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </main>
  );
}

/** Lê ?periodo=, ?data= e ?q= da URL com padrões seguros (mês atual). */
export function parseReportParams(sp: { periodo?: string; data?: string; q?: string; de?: string; ate?: string }) {
  const isIso = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const toUtc = (v: string) => {
    const [yy, mm, dd] = v.split("-").map(Number);
    return new Date(Date.UTC(yy, mm - 1, dd));
  };
  let custom: { from: Date; to: Date } | undefined;
  if (sp.periodo === "personalizado" && isIso(sp.de) && isIso(sp.ate)) {
    const a = toUtc(sp.de!);
    const b = toUtc(sp.ate!);
    // Datas trocadas (fim antes do início) são invertidas em vez de dar erro.
    custom = a <= b ? { from: a, to: b } : { from: b, to: a };
  }
  const period: ReportPeriod =
    sp.periodo === "dia" || sp.periodo === "semana" ? sp.periodo : custom ? "personalizado" : "mes";
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") ? sp.data! : fallback;
  const [y, m, d] = dateISO.split("-").map(Number);
  return { period, dateISO, ref: new Date(Date.UTC(y, m - 1, d)), q: (sp.q ?? "").slice(0, 80), custom };
}
