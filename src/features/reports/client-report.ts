import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { splitServiceName } from "./service";

function assertTeam(ctx: AuthenticatedContext) {
  if (ctx.role === "CLIENT") throw new Error("Relatórios são só para a equipe.");
}

/** Busca de clientes por nome ou telefone (até 20). Profissional só acha quem já atendeu (RLS). */
export async function searchClients(params: { ctx: AuthenticatedContext; q: string }) {
  assertTeam(params.ctx);
  const q = params.q.trim();
  const digits = q.replace(/\D/g, "");
  return withAppContext(params.ctx, async (tx) => {
    const clients = await tx.client.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : undefined,
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 20,
    });
    const ids = clients.map((c) => c.id);
    const visits = await tx.appointment.groupBy({
      by: ["clientId"],
      where: {
        clientId: { in: ids },
        status: "COMPLETED",
        ...(params.ctx.role === "PROFESSIONAL" ? { professionalId: params.ctx.userId ?? "-" } : {}),
      },
      _count: { _all: true },
      _max: { scheduledDate: true },
    });
    const byId = new Map(visits.map((v) => [v.clientId, v]));
    return clients
      .map((c) => ({
        ...c,
        visits: byId.get(c.id)?._count._all ?? 0,
        lastVisit: byId.get(c.id)?._max.scheduledDate?.toISOString().slice(0, 10) ?? null,
      }))
      .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, "pt-BR"));
  });
}

/** Dashboard de UM cliente: tudo que ele fez no intervalo [de, até]. */
export async function getClientReport(params: { ctx: AuthenticatedContext; clientId: string; from: Date; to: Date }) {
  const { ctx, clientId, from, to } = params;
  assertTeam(ctx);
  const professionalId = ctx.role === "PROFESSIONAL" ? (ctx.userId ?? "-") : undefined;
  const toExclusive = new Date(to.getTime() + 86_400_000);

  const [client, appointments] = await Promise.all([
    withAppContext(ctx, (tx) =>
      tx.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          noShowCount: true,
          createdAt: true,
          subscriptions: { where: { status: "ACTIVE" }, select: { plan: { select: { name: true } } }, take: 1 },
        },
      }),
    ),
    withAppContext(ctx, (tx) =>
      tx.appointment.findMany({
        where: {
          clientId,
          scheduledDate: { gte: from, lt: toExclusive },
          ...(professionalId ? { professionalId } : {}),
        },
        select: {
          id: true,
          status: true,
          source: true,
          scheduledDate: true,
          startTime: true,
          totalPrice: true,
          professional: { select: { name: true } },
          services: { select: { service: { select: { name: true } } } },
          products: { select: { quantity: true, product: { select: { name: true } } } },
        },
        orderBy: [{ scheduledDate: "desc" }, { startTime: "desc" }],
      }),
    ),
  ]);
  if (!client) return null;

  const done = appointments.filter((a) => a.status === "COMPLETED");
  const items = new Map<string, number>();
  const pros = new Map<string, number>();
  let spent = 0;
  for (const a of done) {
    spent += Number(a.totalPrice);
    pros.set(a.professional.name, (pros.get(a.professional.name) ?? 0) + 1);
    for (const s of a.services) for (const it of splitServiceName(s.service.name)) items.set(it, (items.get(it) ?? 0) + 1);
  }

  // Série mensal no intervalo (visitas e serviços por mês).
  const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
  const series: { key: string; label: string; visits: number; services: number }[] = [];
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    series.push({
      key: d.toISOString().slice(0, 7),
      label: `${monthFmt.format(d).replace(".", "")}/${String(d.getUTCFullYear()).slice(2)}`,
      visits: 0,
      services: 0,
    });
  }
  for (const a of done) {
    const s = series.find((x) => x.key === a.scheduledDate.toISOString().slice(0, 7));
    if (s) {
      s.visits++;
      s.services += a.services.reduce((k, sv) => k + splitServiceName(sv.service.name).length, 0);
    }
  }

  // Frequência: média de dias entre visitas concluídas.
  const dates = done.map((a) => a.scheduledDate.getTime()).sort((x, y) => x - y);
  const gaps = dates.slice(1).map((t, i) => (t - dates[i]) / 86_400_000);
  const avgGap = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;

  const dmy = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
  return {
    client: {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      noShowCount: client.noShowCount,
      since: client.createdAt.toISOString().slice(0, 10),
      plan: client.subscriptions[0]?.plan.name ?? null,
    },
    kpis: {
      visits: done.length,
      servicesDone: Array.from(items.values()).reduce((s, n) => s + n, 0),
      spent,
      averageTicket: done.length ? spent / done.length : 0,
      noShows: appointments.filter((a) => a.status === "NO_SHOW").length,
      cancelled: appointments.filter((a) => a.status === "CANCELLED").length,
      upcoming: appointments.filter((a) => a.status === "SCHEDULED" || a.status === "CONFIRMED").length,
      lastVisit: done[0] ? dmy.format(done[0].scheduledDate) : null,
      avgGapDays: avgGap,
    },
    items: Array.from(items.entries())
      .map(([item, total]) => ({ item, total }))
      .sort((a, b) => b.total - a.total),
    professionals: Array.from(pros.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total),
    series,
    history: appointments.map((a) => ({
      id: a.id,
      date: dmy.format(a.scheduledDate),
      time: a.startTime,
      status: a.status,
      walkIn: a.source === "WALK_IN",
      professional: a.professional.name,
      services: a.services.map((s) => s.service.name).join(" · "),
      products: a.products.map((p) => `${p.quantity}× ${p.product.name}`).join(", "),
      total: Number(a.totalPrice),
    })),
  };
}

export type ClientReport = NonNullable<Awaited<ReturnType<typeof getClientReport>>>;
export type ClientSearchResult = Awaited<ReturnType<typeof searchClients>>;
