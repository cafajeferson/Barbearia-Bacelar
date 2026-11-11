import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/lib/format";
import type { ReportPeriod, ServiceReport } from "../service";

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

function periodTitle(report: ServiceReport) {
  const start = new Date(`${report.start}T00:00:00Z`);
  const end = new Date(`${report.endInclusive}T00:00:00Z`);
  const fmt = (o: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...o }).format(d);
  if (report.period === "dia") return fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, start);
  if (report.period === "mes") return fmt({ month: "long", year: "numeric" }, start);
  return `${fmt({ day: "2-digit", month: "2-digit" }, start)} a ${fmt({ day: "2-digit", month: "2-digit", year: "numeric" }, end)}`;
}

/**
 * Tela de Relatórios — usada pelo admin (todos ou um profissional) e pelo
 * profissional (só os próprios). Tudo por link/URL: período, data e
 * profissional ficam na query string, então dá para voltar e compartilhar.
 */
export function ServiceReportView({
  report,
  basePath,
  dateISO,
  showProfessionalFilter,
}: {
  report: ServiceReport;
  basePath: string;
  dateISO: string;
  showProfessionalFilter: boolean;
}) {
  const href = (over: { periodo?: ReportPeriod; data?: string; prof?: string | null }) => {
    const q = new URLSearchParams();
    q.set("periodo", over.periodo ?? report.period);
    q.set("data", over.data ?? dateISO);
    const prof = over.prof === undefined ? report.professionalId : over.prof;
    if (showProfessionalFilter && prof) q.set("prof", prof);
    return `${basePath}?${q.toString()}`;
  };
  const chip = (active: boolean) =>
    cn(
      "whitespace-nowrap rounded-full border px-3 py-1 text-sm",
      active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
    );
  const max = report.items[0]?.total ?? 1;
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const proName = (id: string) => report.professionals.find((p) => p.id === id)?.name ?? "—";
  const showByPro = showProfessionalFilter && !report.professionalId && report.professionals.length > 1;

  return (
    <main className="space-y-4 p-3 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-muted-foreground">
          Serviços realizados (atendimentos concluídos). Combo conta 1 de cada: “Corte + Barba” = 1 corte e 1 barba.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border p-1">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={href({ periodo: p.value })}
              prefetch={false}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                report.period === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link href={href({ data: shift(dateISO, report.period, -1) })} prefetch={false} className="rounded-md border p-2 hover:bg-accent" aria-label="Período anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-0 px-2 text-sm font-medium first-letter:uppercase">{periodTitle(report)}</span>
          <Link href={href({ data: shift(dateISO, report.period, 1) })} prefetch={false} className="rounded-md border p-2 hover:bg-accent" aria-label="Próximo período">
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href={href({ data: todayISO })} prefetch={false} className="ml-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Hoje
          </Link>
        </div>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Serviços feitos</p>
          <p className="text-2xl font-semibold text-primary">{report.kpis.servicesDone}</p>
          <p className="text-xs text-muted-foreground">combo conta cada serviço</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Atendimentos</p>
          <p className="text-2xl font-semibold">{report.kpis.attendances}</p>
          <p className="text-xs text-muted-foreground">{report.kpis.walkIns} sem hora marcada</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Faturamento</p>
          <p className="text-2xl font-semibold">{formatBRL(report.kpis.revenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Ticket médio</p>
          <p className="text-2xl font-semibold">{formatBRL(report.kpis.averageTicket)}</p>
          <p className="text-xs text-muted-foreground">por atendimento</p>
        </Card>
      </div>

      {report.items.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">Nenhum serviço concluído neste período.</Card>
      ) : (
        <>
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Serviços feitos no período</h2>
            <ul className="space-y-2">
              {report.items.map((r) => (
                <li key={r.item} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_3rem]">
                  <span className="truncate" title={r.item}>
                    {r.item}
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-secondary">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (r.total / max) * 100)}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{r.total}</span>
                </li>
              ))}
            </ul>
          </Card>

          {report.buckets.length > 1 && (
            <div>
              <h2 className="mb-2 font-semibold">{report.period === "mes" ? "Semana a semana" : "Dia a dia"}</h2>
              <div className="rounded-lg border">
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
              <h2 className="mb-2 font-semibold">Por colaborador</h2>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      {report.professionals.map((p) => (
                        <TableHead key={p.id} className="whitespace-nowrap text-right">
                          {proName(p.id)}
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
            <h2 className="mb-2 font-semibold">Como foi vendido (itens do catálogo)</h2>
            <div className="rounded-lg border">
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
        </>
      )}

      {report.trend.rows.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold">Mês a mês (últimos 6 meses)</h2>
          <div className="rounded-lg border">
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
    </main>
  );
}

/** Lê ?periodo= e ?data= da URL com padrões seguros (mês atual). */
export function parseReportParams(sp: { periodo?: string; data?: string }) {
  const period: ReportPeriod = sp.periodo === "dia" || sp.periodo === "semana" ? sp.periodo : "mes";
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") ? sp.data! : fallback;
  const [y, m, d] = dateISO.split("-").map(Number);
  return { period, dateISO, ref: new Date(Date.UTC(y, m - 1, d)) };
}
