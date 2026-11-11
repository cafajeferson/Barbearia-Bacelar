import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { resolveRange, type CustomRange, type ReportPeriod } from "./service";

/**
 * Produtos comprados pelos clientes no período: os pedidos junto do
 * agendamento (só de atendimentos CONCLUÍDOS — é quando o cliente retira
 * e paga) mais as vendas avulsas de balcão. Admin vê todos ou um
 * colaborador; profissional só o que saiu nos atendimentos dele.
 */
export async function getProductReport(params: {
  ctx: AuthenticatedContext;
  period: ReportPeriod;
  ref: Date;
  professionalId?: string;
  q?: string;
  custom?: CustomRange;
}) {
  const { ctx, period, ref } = params;
  if (ctx.role === "CLIENT") throw new Error("Relatórios são só para a equipe.");
  const professionalId = ctx.role === "PROFESSIONAL" ? (ctx.userId ?? "-") : params.professionalId;
  const { start, end, prev } = resolveRange(period, ref, params.custom);

  const [lines, sales, professionals] = await Promise.all([
    withAppContext(ctx, (tx) =>
      tx.appointmentProduct.findMany({
        where: {
          appointment: {
            status: "COMPLETED",
            scheduledDate: { gte: prev.start, lt: end },
            ...(professionalId ? { professionalId } : {}),
          },
        },
        select: {
          quantity: true,
          priceAtBooking: true,
          product: { select: { id: true, name: true, brand: true } },
          appointment: {
            select: {
              id: true,
              scheduledDate: true,
              startTime: true,
              professionalId: true,
              professional: { select: { name: true } },
              client: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ),
    ctx.role === "ADMIN"
      ? withAppContext(ctx, (tx) =>
          tx.productSale.findMany({
            where: {
              createdAt: { gte: prev.start, lt: end },
              ...(professionalId ? { professionalId } : {}),
            },
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              createdAt: true,
              professionalId: true,
              professional: { select: { name: true } },
              client: { select: { id: true, name: true } },
              product: { select: { id: true, name: true, brand: true } },
            },
          }),
        )
      : Promise.resolve([]),
    ctx.role === "ADMIN"
      ? withAppContext(ctx, (tx) => tx.professional.findMany({ select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }))
      : Promise.resolve([]),
  ]);

  type Purchase = {
    id: string;
    day: Date;
    time: string;
    clientId: string | null;
    client: string;
    professionalId: string | null;
    professional: string;
    productId: string;
    product: string;
    quantity: number;
    total: number;
  };
  const all: Purchase[] = [
    ...lines.map((l) => ({
      id: `${l.appointment.id}-${l.product.id}`,
      day: l.appointment.scheduledDate,
      time: l.appointment.startTime,
      clientId: l.appointment.client.id,
      client: l.appointment.client.name,
      professionalId: l.appointment.professionalId,
      professional: l.appointment.professional.name,
      productId: l.product.id,
      product: l.product.brand ? `${l.product.name} (${l.product.brand})` : l.product.name,
      quantity: l.quantity,
      total: l.quantity * Number(l.priceAtBooking),
    })),
    ...sales.map((s) => ({
      id: s.id,
      day: new Date(Date.UTC(s.createdAt.getFullYear(), s.createdAt.getMonth(), s.createdAt.getDate())),
      time: `${String(s.createdAt.getHours()).padStart(2, "0")}:${String(s.createdAt.getMinutes()).padStart(2, "0")}`,
      clientId: s.client?.id ?? null,
      client: s.client?.name ?? "Venda de balcão",
      professionalId: s.professionalId,
      professional: s.professional?.name ?? "—",
      productId: s.product.id,
      product: s.product.brand ? `${s.product.name} (${s.product.brand})` : s.product.name,
      quantity: s.quantity,
      total: s.quantity * Number(s.unitPrice),
    })),
  ];

  const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = fold(params.q?.trim() ?? "");
  const matching = q ? all.filter((p) => fold(p.client).includes(q) || fold(p.product).includes(q)) : all;
  const inPeriod = matching.filter((p) => p.day >= start && p.day < end);
  const inPrev = matching.filter((p) => p.day >= prev.start && p.day < prev.end);

  const sum = (arr: Purchase[], f: (p: Purchase) => number) => arr.reduce((s, p) => s + f(p), 0);
  const units = sum(inPeriod, (p) => p.quantity);
  const revenue = sum(inPeriod, (p) => p.total);
  const buyers = new Set(inPeriod.map((p) => p.clientId ?? p.id)).size;
  const delta = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

  const products = new Map<string, { name: string; units: number; revenue: number; clients: Map<string, number> }>();
  const byPro = new Map<string, { name: string; units: number }>();
  for (const p of inPeriod) {
    const row = products.get(p.productId) ?? { name: p.product, units: 0, revenue: 0, clients: new Map() };
    row.units += p.quantity;
    row.revenue += p.total;
    row.clients.set(p.client, (row.clients.get(p.client) ?? 0) + p.quantity);
    products.set(p.productId, row);
    const key = p.professionalId ?? "-";
    const pr = byPro.get(key) ?? { name: p.professional, units: 0 };
    pr.units += p.quantity;
    byPro.set(key, pr);
  }

  const series: { label: string; units: number }[] = [];
  const dm = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "UTC" });
  const wd = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
  const dmShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  if (period === "dia") {
    for (let h = 8; h <= 20; h++) series.push({ label: `${String(h).padStart(2, "0")}h`, units: 0 });
    for (const p of inPeriod) {
      const i = Math.min(Math.max(Number(p.time.slice(0, 2)) - 8, 0), series.length - 1);
      series[i].units += p.quantity;
    }
  } else {
    for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) {
      const d = new Date(t);
      series.push({ label: period === "semana" ? wd.format(d).replace(".", "") : period === "personalizado" ? dmShort.format(d) : dm.format(d), units: 0 });
    }
    for (const p of inPeriod) {
      const i = Math.round((p.day.getTime() - start.getTime()) / 86_400_000);
      if (series[i]) series[i].units += p.quantity;
    }
  }

  const dmy = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return {
    period,
    start: start.toISOString().slice(0, 10),
    endInclusive: new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10),
    professionalId: professionalId ?? null,
    query: params.q?.trim() ?? "",
    professionals: professionals.filter((p) => p.active),
    kpis: { units, revenue, buyers, averagePerBuyer: buyers ? revenue / buyers : 0 },
    deltas: {
      units: delta(units, sum(inPrev, (p) => p.quantity)),
      revenue: delta(revenue, sum(inPrev, (p) => p.total)),
    },
    series,
    products: Array.from(products.values())
      .map((p) => ({
        name: p.name,
        units: p.units,
        revenue: p.revenue,
        clients: Array.from(p.clients.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR")),
      }))
      .sort((a, b) => b.units - a.units),
    byProfessional: Array.from(byPro.values()).sort((a, b) => b.units - a.units),
    purchases: [...inPeriod]
      .sort((a, b) => b.day.getTime() - a.day.getTime() || b.time.localeCompare(a.time))
      .map((p) => ({ id: p.id, date: dmy.format(p.day), time: p.time, client: p.client, professional: p.professional, product: p.product, quantity: p.quantity, total: p.total })),
  };
}

export type ProductReport = Awaited<ReturnType<typeof getProductReport>>;
