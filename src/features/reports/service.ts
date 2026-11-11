import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

export type ReportPeriod = "dia" | "semana" | "mes" | "personalizado";

/** Intervalo livre ("de tal data a tal data"), datas inclusivas em UTC. */
export type CustomRange = { from: Date; to: Date };

/**
 * Quebra o nome do serviço do catálogo nos serviços que ele contém:
 * "Corte + Barba + Sobrancelha" conta como 1 Corte, 1 Barba e 1
 * Sobrancelha. Pedaços que não são serviço (ex.: o "1" de "Corte+1") são
 * ignorados. A grafia é normalizada ("barba" e "Barba" são o mesmo item).
 */
export function splitServiceName(name: string): string[] {
  return name
    .split("+")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 1 && !/^\d+$/.test(part))
    .map((part) => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1).toLocaleLowerCase("pt-BR"));
}

/** Datas "somente data" em UTC (mesma convenção das colunas @db.Date). */
function utcDay(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Início (inclusive) e fim (exclusive) do período que contém `ref`. Semana começa na segunda. */
export function periodRange(period: Exclude<ReportPeriod, "personalizado">, ref: Date) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const d = ref.getUTCDate();
  if (period === "dia") return { start: utcDay(y, m, d), end: utcDay(y, m, d + 1) };
  if (period === "semana") {
    const offset = (ref.getUTCDay() + 6) % 7; // segunda = 0
    return { start: utcDay(y, m, d - offset), end: utcDay(y, m, d - offset + 7) };
  }
  return { start: utcDay(y, m, 1), end: utcDay(y, m + 1, 1) };
}

/**
 * Intervalo do relatório e o período anterior de mesmo tamanho (para a
 * variação % dos cards). No personalizado, o anterior é o mesmo número de
 * dias imediatamente antes do início.
 */
export function resolveRange(period: ReportPeriod, ref: Date, custom?: CustomRange) {
  if (period === "personalizado" && custom) {
    const start = custom.from;
    const end = new Date(custom.to.getTime() + 86_400_000);
    const len = end.getTime() - start.getTime();
    return { start, end, prev: { start: new Date(start.getTime() - len), end: start } };
  }
  const p = period === "personalizado" ? "mes" : period;
  const { start, end } = periodRange(p, ref);
  const prevRef =
    p === "mes"
      ? utcDay(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)
      : new Date(start.getTime() - (p === "semana" ? 7 : 1) * 86_400_000);
  return { start, end, prev: periodRange(p, prevRef) };
}

/** Colunas da evolução dentro do período: mês -> semanas; semana -> dias; dia -> o próprio dia. */
function buckets(period: ReportPeriod, start: Date, end: Date) {
  const out: { key: string; label: string; start: Date; end: Date }[] = [];
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
  const dm = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (period === "mes" || (period === "personalizado" && days > 14)) {
    let cursor = start;
    let n = 1;
    while (cursor < end) {
      const offset = (cursor.getUTCDay() + 6) % 7;
      const next = new Date(Math.min(utcDay(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() - offset + 7).getTime(), end.getTime()));
      const last = new Date(next.getTime() - 86_400_000);
      out.push({ key: iso(cursor), label: `Sem ${n} (${dm.format(cursor)}–${dm.format(last)})`, start: cursor, end: next });
      cursor = next;
      n++;
    }
  } else {
    for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) {
      const day = new Date(t);
      out.push({
        key: iso(day),
        label: `${weekday.format(day).replace(".", "")} ${dm.format(day)}`,
        start: day,
        end: new Date(t + 86_400_000),
      });
    }
  }
  return out;
}

/**
 * Relatório de serviços realizados (atendimentos CONCLUÍDOS).
 * ADMIN vê todos ou um profissional; PROFESSIONAL vê sempre só os seus —
 * o filtro é forçado aqui e a RLS também barra o resto.
 */
export async function getServiceReport(params: {
  ctx: AuthenticatedContext;
  period: ReportPeriod;
  ref: Date;
  professionalId?: string;
  /** Busca individual: nome do cliente ou serviço (sem diferenciar acento/maiúscula). */
  q?: string;
  /** Intervalo livre quando period = "personalizado". */
  custom?: CustomRange;
}) {
  const { ctx, period } = params;
  if (ctx.role === "CLIENT") throw new Error("Relatórios são só para a equipe.");
  const professionalId = ctx.role === "PROFESSIONAL" ? (ctx.userId ?? "-") : params.professionalId;

  const { start, end, prev } = resolveRange(period, params.ref, params.custom);
  // Referência da tendência mês a mês: o último dia do intervalo.
  const ref = period === "personalizado" ? new Date(end.getTime() - 86_400_000) : params.ref;
  // Tendência mês a mês: os 6 meses até o mês de referência.
  const trendStart = utcDay(ref.getUTCFullYear(), ref.getUTCMonth() - 5, 1);
  const trendEnd = utcDay(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1);
  const rangeStart = [trendStart, start, prev.start].reduce((a, b) => (b < a ? b : a));
  const rangeEnd = trendEnd > end ? trendEnd : end;

  const [appointments, professionals] = await Promise.all([
    withAppContext(ctx, (tx) =>
      tx.appointment.findMany({
        where: {
          status: "COMPLETED",
          scheduledDate: { gte: rangeStart, lt: rangeEnd },
          ...(professionalId ? { professionalId } : {}),
        },
        select: {
          scheduledDate: true,
          professionalId: true,
          source: true,
          id: true,
          startTime: true,
          totalPrice: true,
          client: { select: { name: true } },
          professional: { select: { name: true } },
          services: { select: { priceAtBooking: true, service: { select: { name: true } } } },
        },
      }),
    ),
    ctx.role === "ADMIN"
      ? withAppContext(ctx, (tx) =>
          tx.professional.findMany({ select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }),
        )
      : Promise.resolve([]),
  ]);

  // Busca: se o termo bate no NOME DO CLIENTE, entra o atendimento inteiro;
  // se bate num SERVIÇO, entram só os serviços que batem (buscar "barba"
  // conta as barbas, inclusive dentro de "Corte + Barba").
  const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = fold(params.q?.trim() ?? "");
  const filtered = appointments
    .map((a) => {
      if (!q || fold(a.client.name).includes(q)) return a;
      const services = a.services
        .map((sv) => ({ ...sv, parts: splitServiceName(sv.service.name).filter((it) => fold(it).includes(q)) }))
        .filter((sv) => sv.parts.length > 0);
      return services.length ? { ...a, services, onlyParts: true as const } : null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
  const partsOf = (a: (typeof filtered)[number], sv: (typeof filtered)[number]["services"][number]) =>
    "parts" in sv && Array.isArray((sv as { parts?: string[] }).parts)
      ? (sv as { parts: string[] }).parts
      : splitServiceName(sv.service.name);

  const inPeriod = filtered.filter((a) => a.scheduledDate >= start && a.scheduledDate < end);

  // Atalhos de um clique: os serviços mais feitos no período, sem a busca.
  const quickCount = new Map<string, number>();
  for (const a of appointments) {
    if (a.scheduledDate < start || a.scheduledDate >= end) continue;
    for (const sv of a.services) for (const it of splitServiceName(sv.service.name)) quickCount.set(it, (quickCount.get(it) ?? 0) + 1);
  }
  const quickItems = Array.from(quickCount.entries())
    .sort((x, y) => y[1] - x[1])
    .slice(0, 12)
    .map(([it]) => it);
  const cols = buckets(period, start, end);

  type Row = { item: string; total: number; byBucket: Record<string, number>; byProfessional: Record<string, number> };
  const rows = new Map<string, Row>();
  const catalogRows = new Map<string, { name: string; count: number; revenue: number }>();
  let revenue = 0;
  let walkIns = 0;
  for (const a of inPeriod) {
    revenue += Number(a.totalPrice);
    if (a.source === "WALK_IN") walkIns++;
    const bucket = cols.find((c) => a.scheduledDate >= c.start && a.scheduledDate < c.end)?.key ?? "";
    for (const s of a.services) {
      const cat = catalogRows.get(s.service.name) ?? { name: s.service.name, count: 0, revenue: 0 };
      cat.count++;
      cat.revenue += Number(s.priceAtBooking);
      catalogRows.set(s.service.name, cat);
      for (const item of partsOf(a, s)) {
        const row = rows.get(item) ?? { item, total: 0, byBucket: {}, byProfessional: {} };
        row.total++;
        row.byBucket[bucket] = (row.byBucket[bucket] ?? 0) + 1;
        row.byProfessional[a.professionalId] = (row.byProfessional[a.professionalId] ?? 0) + 1;
        rows.set(item, row);
      }
    }
  }

  // Mês a mês (6 meses), por item.
  const months = Array.from({ length: 6 }, (_, i) => utcDay(ref.getUTCFullYear(), ref.getUTCMonth() - 5 + i, 1));
  const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
  const monthLabel = {
    format: (d: Date) => `${monthShort.format(d).replace(".", "")}/${String(d.getUTCFullYear()).slice(2)}`,
  };
  const trend = new Map<string, number[]>();
  const trendTotals = months.map(() => 0);
  for (const a of filtered) {
    const idx = months.findIndex((m, i) => a.scheduledDate >= m && (i === 5 ? a.scheduledDate < trendEnd : a.scheduledDate < months[i + 1]));
    if (idx < 0) continue;
    for (const s of a.services) {
      for (const item of partsOf(a, s)) {
        const arr = trend.get(item) ?? months.map(() => 0);
        arr[idx]++;
        trend.set(item, arr);
        trendTotals[idx]++;
      }
    }
  }

  // Série para o gráfico de área: mês/semana -> por dia; dia -> por hora.
  const series: { label: string; services: number; revenue: number }[] = [];
  if (period === "dia") {
    for (let h = 8; h <= 20; h++) series.push({ label: `${String(h).padStart(2, "0")}h`, services: 0, revenue: 0 });
  } else {
    const dm = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "UTC" });
    const wd = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
    const dmShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
    for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) {
      const d = new Date(t);
      series.push({ label: period === "semana" ? wd.format(d).replace(".", "") : period === "personalizado" ? dmShort.format(d) : dm.format(d), services: 0, revenue: 0 });
    }
  }
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => ({ label, services: 0 }));
  for (const a of inPeriod) {
    const n = a.services.reduce((k, sv) => k + partsOf(a, sv).length, 0);
    const idx =
      period === "dia"
        ? Math.min(Math.max(Number(a.startTime.slice(0, 2)) - 8, 0), series.length - 1)
        : Math.round((a.scheduledDate.getTime() - start.getTime()) / 86_400_000);
    if (series[idx]) {
      series[idx].services += n;
      series[idx].revenue += Number(a.totalPrice);
    }
    weekdays[a.scheduledDate.getUTCDay()].services += n;
  }

  const inPrev = filtered.filter((a) => a.scheduledDate >= prev.start && a.scheduledDate < prev.end);
  const prevKpis = {
    attendances: inPrev.length,
    servicesDone: inPrev.reduce((k, a) => k + a.services.reduce((j, sv) => j + partsOf(a, sv).length, 0), 0),
    revenue: inPrev.reduce((k, a) => k + Number(a.totalPrice), 0),
  };
  const delta = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

  const dmy = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const attendances = [...inPeriod]
    .sort((x, y) => y.scheduledDate.getTime() - x.scheduledDate.getTime() || y.startTime.localeCompare(x.startTime))
    .map((a) => ({
      id: a.id,
      date: dmy.format(a.scheduledDate),
      time: a.startTime,
      client: a.client.name,
      professional: a.professional.name,
      services: a.services.map((sv) => sv.service.name).join(" · "),
      total: Number(a.totalPrice),
      walkIn: a.source === "WALK_IN",
    }));
  const clientsByItem = new Map<string, Map<string, number>>();
  for (const a of inPeriod) {
    for (const sv of a.services) {
      for (const item of partsOf(a, sv)) {
        const m = clientsByItem.get(item) ?? new Map<string, number>();
        m.set(a.client.name, (m.get(a.client.name) ?? 0) + 1);
        clientsByItem.set(item, m);
      }
    }
  }

  const items = Array.from(rows.values()).sort((x, y) => y.total - x.total || x.item.localeCompare(y.item, "pt-BR"));
  const totalItems = items.reduce((s, r) => s + r.total, 0);

  return {
    period,
    start: iso(start),
    endInclusive: iso(new Date(end.getTime() - 86_400_000)),
    professionalId: professionalId ?? null,
    professionals: professionals.filter((p) => p.active || items.some((r) => r.byProfessional[p.id])),
    kpis: {
      attendances: inPeriod.length,
      servicesDone: totalItems,
      revenue,
      averageTicket: inPeriod.length ? revenue / inPeriod.length : 0,
      walkIns,
    },
    deltas: {
      servicesDone: delta(totalItems, prevKpis.servicesDone),
      attendances: delta(inPeriod.length, prevKpis.attendances),
      revenue: delta(revenue, prevKpis.revenue),
      averageTicket: delta(
        inPeriod.length ? revenue / inPeriod.length : 0,
        prevKpis.attendances ? prevKpis.revenue / prevKpis.attendances : 0,
      ),
    },
    series,
    quickItems,
    query: params.q?.trim() ?? "",
    attendances,
    clientsByItem: Object.fromEntries(
      Array.from(clientsByItem.entries()).map(([item, m]) => [
        item,
        Array.from(m.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, "pt-BR")),
      ]),
    ) as Record<string, { name: string; count: number }[]>,
    weekdays: [...weekdays.slice(1), weekdays[0]],
    buckets: cols.map((c) => ({ key: c.key, label: c.label })),
    items,
    catalog: Array.from(catalogRows.values()).sort((x, y) => y.count - x.count),
    trend: {
      months: months.map((m) => monthLabel.format(m)),
      totals: trendTotals,
      rows: Array.from(trend.entries())
        .map(([item, counts]) => ({ item, counts, total: counts.reduce((s, n) => s + n, 0) }))
        .sort((x, y) => y.total - x.total),
    },
  };
}

export type ServiceReport = Awaited<ReturnType<typeof getServiceReport>>;
