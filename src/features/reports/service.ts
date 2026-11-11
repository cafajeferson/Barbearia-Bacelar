import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

export type ReportPeriod = "dia" | "semana" | "mes";

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
export function periodRange(period: ReportPeriod, ref: Date) {
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

/** Colunas da evolução dentro do período: mês -> semanas; semana -> dias; dia -> o próprio dia. */
function buckets(period: ReportPeriod, start: Date, end: Date) {
  const out: { key: string; label: string; start: Date; end: Date }[] = [];
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
  const dm = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  if (period === "mes") {
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
}) {
  const { ctx, period, ref } = params;
  if (ctx.role === "CLIENT") throw new Error("Relatórios são só para a equipe.");
  const professionalId = ctx.role === "PROFESSIONAL" ? (ctx.userId ?? "-") : params.professionalId;

  const { start, end } = periodRange(period, ref);
  // Tendência mês a mês: os 6 meses até o mês de referência.
  const trendStart = utcDay(ref.getUTCFullYear(), ref.getUTCMonth() - 5, 1);
  const trendEnd = utcDay(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1);
  const rangeStart = trendStart < start ? trendStart : start;
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
          totalPrice: true,
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

  const inPeriod = appointments.filter((a) => a.scheduledDate >= start && a.scheduledDate < end);
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
      for (const item of splitServiceName(s.service.name)) {
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
  for (const a of appointments) {
    const idx = months.findIndex((m, i) => a.scheduledDate >= m && (i === 5 ? a.scheduledDate < trendEnd : a.scheduledDate < months[i + 1]));
    if (idx < 0) continue;
    for (const s of a.services) {
      for (const item of splitServiceName(s.service.name)) {
        const arr = trend.get(item) ?? months.map(() => 0);
        arr[idx]++;
        trend.set(item, arr);
        trendTotals[idx]++;
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
