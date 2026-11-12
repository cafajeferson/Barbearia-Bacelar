import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { combineDateAndTime } from "@/shared/lib/time";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export async function getDashboardData(params: {
  ctx: AuthenticatedContext;
  unitId?: string;
  periodStart?: Date; // se undefined, considera todo o histórico ("Todos os meses")
}) {
  const { ctx, unitId, periodStart } = params;
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Mês escolhido na barra do topo: [periodStart, periodEnd). Sem período = todo o histórico.
  const periodEnd = periodStart ? new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1) : undefined;
  const prevStart = periodStart ? new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, 1) : undefined;
  const isCurrentMonth = !periodStart || periodStart.getTime() === monthStart.getTime();
  // Colunas @db.Date chegam como meia-noite UTC: o filtro usa a mesma âncora.
  const asDateCol = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

  const unitFilter = unitId ? { unitId } : {};
  const recentRangeStart = yesterday < monthStart ? yesterday : monthStart;

  // Consultas na mesma `tx` rodam em SÉRIE (uma conexão), e cada uma paga
  // uma viagem inteira até o Supabase (Brasil <-> us-east-1, ~140ms+ cada):
  // 8 queries em série custavam ~1,5s só de rede, era a página mais lenta
  // do app. Dividimos em 3 transações PARALELAS (pool tem 5 conexões, o
  // layout já não briga mais — auth/units têm cache) — ~3 viagens de rede
  // no caminho crítico em vez de ~10.
  const [groupA, groupB, groupC] = await Promise.all([
    withAppContext(ctx, async (tx) => {
      const recentAppointments = await tx.appointment.findMany({
        where: { ...unitFilter, scheduledDate: { gte: recentRangeStart }, status: { not: "CANCELLED" } },
        select: { scheduledDate: true, status: true, totalPrice: true, products: { select: { quantity: true, priceAtBooking: true } } },
      });
      const upcoming = await tx.appointment.findMany({
        where: { ...unitFilter, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledDate: { gte: today } },
        include: { client: true, professional: true, services: { include: { service: true } } },
        orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
        take: 5,
      });
      const recentActivity = await tx.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
      return { recentAppointments, upcoming, recentActivity };
    }),
    withAppContext(ctx, async (tx) => {
      const periodAppointments = await tx.appointment.findMany({
        where: {
          ...unitFilter,
          scheduledDate: periodStart && periodEnd ? { gte: asDateCol(periodStart), lt: asDateCol(periodEnd) } : undefined,
        },
        include: {
          services: { include: { service: true } },
          products: { select: { quantity: true, priceAtBooking: true } },
          professional: true,
        },
      });
      // Receita do mês anterior ao escolhido, para a comparação do cartão.
      const previousMonth =
        prevStart && periodStart
          ? await tx.appointment.findMany({
              where: { ...unitFilter, status: "COMPLETED", scheduledDate: { gte: asDateCol(prevStart), lt: asDateCol(periodStart) } },
              select: { totalPrice: true, products: { select: { quantity: true, priceAtBooking: true } } },
            })
          : [];
      const allOpenAppointments = await tx.appointment.findMany({
        where: { ...unitFilter, status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] } },
        include: { client: true, professional: true },
        orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
      });
      return { periodAppointments, allOpenAppointments, previousMonth };
    }),
    withAppContext(ctx, async (tx) => {
      // totalClients + newClientsInPeriod: mesma tabela, 1 SELECT com dois
      // COUNT(*) FILTER em vez de duas queries.
      const clientCounts = await tx.$queryRaw<{ total: bigint; new_in_period: bigint }[]>`
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE "createdAt" >= ${periodStart ?? monthStart}) AS new_in_period
        FROM "Client"
      `;
      const pendingCount = await tx.appointment.count({
        where: { ...unitFilter, status: { in: ["SCHEDULED", "CONFIRMED"] } },
      });
      const activeProfessionals = await tx.professional.count({ where: { active: true } });
      // Painel: comissões ainda a pagar (do período escolhido, ou tudo) e
      // assinaturas ativas com a soma das mensalidades.
      const commissionWhere = periodStart && periodEnd ? { periodMonth: { gte: asDateCol(periodStart), lt: asDateCol(periodEnd) } } : {};
      const pendingCommissions = await tx.commissionEntry.aggregate({
        where: { status: "PENDING", ...commissionWhere },
        _sum: { calculatedAmount: true },
      });
      const allCommissions = await tx.commissionEntry.aggregate({
        where: commissionWhere,
        _sum: { calculatedAmount: true },
      });
      const activeSubs = await tx.clientSubscription.findMany({
        where: { status: "ACTIVE" },
        select: { plan: { select: { priceMonthly: true } } },
      });
      return { clientCounts, pendingCount, activeProfessionals, pendingCommissions, allCommissions, activeSubs };
    }),
  ]);

  const { recentAppointments, upcoming, recentActivity } = groupA;
  const { periodAppointments, allOpenAppointments, previousMonth } = groupB;
  const { clientCounts, pendingCount, activeProfessionals, pendingCommissions, allCommissions, activeSubs } = groupC;

  {
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const todayKey = dayKey(today);
    const yesterdayKey = dayKey(yesterday);
    const monthStartKey = dayKey(monthStart);
    const todayRows = recentAppointments.filter((r) => dayKey(r.scheduledDate) === todayKey);
    const yesterdayRows = recentAppointments.filter((r) => dayKey(r.scheduledDate) === yesterdayKey);
    // Comparação por string "YYYY-MM-DD" (não Date >= direto): scheduledDate
    // vem ancorado em meia-noite UTC, monthStart em meia-noite LOCAL — num
    // fuso negativo (Brasil, UTC-3) isso faz meia-noite local cair às 03h
    // UTC do mesmo dia, então um Date >= Date puro excluiria por engano um
    // agendamento no dia 1º às 00h UTC. Comparar a data-string evita isso.
    const monthRows = recentAppointments.filter((r) => dayKey(r.scheduledDate) >= monthStartKey);
    const appointmentsToday = todayRows.length;
    const appointmentsYesterday = yesterdayRows.length;
    const completedToday = todayRows.filter((r) => r.status === "COMPLETED");
    const completedYesterday = yesterdayRows.filter((r) => r.status === "COMPLETED");
    const completedMonth = monthRows.filter((r) => r.status === "COMPLETED");

    const totalClients = Number(clientCounts[0]?.total ?? 0);
    const newClientsInPeriod = Number(clientCounts[0]?.new_in_period ?? 0);

    // Receita = serviços (totalPrice) + produtos levados no atendimento.
    const revenueOf = (r: { totalPrice: unknown; products: { quantity: number; priceAtBooking: unknown }[] }) =>
      Number(r.totalPrice) + r.products.reduce((s, p) => s + p.quantity * Number(p.priceAtBooking), 0);
    const sumPrice = (rows: Parameters<typeof revenueOf>[0][]) => rows.reduce((sum, r) => sum + revenueOf(r), 0);

    const revenueToday = sumPrice(completedToday);
    const revenueYesterday = sumPrice(completedYesterday);
    const revenueMonth = sumPrice(completedMonth);
    const revenueChangePct =
      revenueYesterday > 0 ? ((revenueToday - revenueYesterday) / revenueYesterday) * 100 : null;

    const completedPeriod = periodAppointments.filter((a) => a.status === "COMPLETED");
    const revenuePeriod = sumPrice(completedPeriod);
    const revenuePrevious = sumPrice(previousMonth);
    const productsRevenuePeriod = completedPeriod.reduce((sum, a) => sum + revenueOf(a) - Number(a.totalPrice), 0);
    const appointmentsPeriod = periodAppointments.filter((a) => a.status !== "CANCELLED").length;

    // Faturamento para o gráfico: dia a dia no mês escolhido, ou mês a mês em "Todos os meses".
    const series: { label: string; value: number }[] = [];
    if (periodStart && periodEnd) {
      const days = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000);
      const byDay = new Array<number>(days).fill(0);
      for (const a of completedPeriod) byDay[a.scheduledDate.getUTCDate() - 1] += revenueOf(a);
      byDay.forEach((value, i) => series.push({ label: String(i + 1).padStart(2, "0"), value: Math.round(value) }));
    } else {
      const byMonth = new Map<string, number>();
      for (const a of completedPeriod) {
        const key = a.scheduledDate.toISOString().slice(0, 7);
        byMonth.set(key, (byMonth.get(key) ?? 0) + revenueOf(a));
      }
      for (const key of Array.from(byMonth.keys()).sort()) {
        const [y, m] = key.split("-").map(Number);
        const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(y, m - 1, 1)).replace(".", "");
        series.push({ label: `${label}/${String(y).slice(2)}`, value: Math.round(byMonth.get(key) ?? 0) });
      }
    }

    const noShowInPeriod = periodAppointments.filter((a) => a.status === "NO_SHOW").length;
    const noShowRate =
      periodAppointments.length > 0 ? (noShowInPeriod / periodAppointments.length) * 100 : 0;
    const cancellationsInPeriod = periodAppointments.filter((a) => a.status === "CANCELLED").length;

    const rankingMap = new Map<string, { name: string; color: string; revenue: number; count: number }>();
    for (const a of periodAppointments) {
      if (a.status !== "COMPLETED") continue;
      const entry = rankingMap.get(a.professionalId) ?? {
        name: a.professional.name,
        color: a.professional.color,
        revenue: 0,
        count: 0,
      };
      entry.revenue += Number(a.totalPrice);
      entry.count += 1;
      rankingMap.set(a.professionalId, entry);
    }
    const ranking = Array.from(rankingMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    const serviceMap = new Map<string, { name: string; revenue: number; count: number }>();
    for (const a of periodAppointments) {
      if (a.status !== "COMPLETED") continue;
      for (const as of a.services) {
        const entry = serviceMap.get(as.serviceId) ?? { name: as.service.name, revenue: 0, count: 0 };
        entry.revenue += Number(as.priceAtBooking);
        entry.count += 1;
        serviceMap.set(as.serviceId, entry);
      }
    }
    const popularServices = Array.from(serviceMap.values()).sort((a, b) => b.count - a.count).slice(0, 6);

    const now = new Date();
    const openAppointments = allOpenAppointments
      .map((a) => ({
        ...a,
        scheduledAt: combineDateAndTime(a.scheduledDate, a.startTime),
      }))
      .filter((a) => now.getTime() - a.scheduledAt.getTime() > 24 * 3_600_000)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    return {
      greetingHour: now.getHours(),
      today,
      kpis: {
        revenueToday,
        revenueYesterday,
        revenueMonth,
        revenueChangePct,
        appointmentsToday,
        appointmentsYesterday,
        pendingCount,
        noShowRate,
      },
      // Mês escolhido na barra do topo (null = "Todos os meses").
      period: periodStart
        ? {
            isCurrentMonth,
            revenue: revenuePeriod,
            productsRevenue: productsRevenuePeriod,
            revenueChangePct: revenuePrevious > 0 ? ((revenuePeriod - revenuePrevious) / revenuePrevious) * 100 : null,
            appointments: appointmentsPeriod,
            completed: completedPeriod.length,
            averageTicket: completedPeriod.length ? revenuePeriod / completedPeriod.length : 0,
          }
        : null,
      painel: {
        totalClients,
        newClientsInPeriod,
        activeProfessionals,
        commissionsInPeriod: Number(allCommissions._sum.calculatedAmount ?? 0),
        commissionsPending: Number(pendingCommissions._sum.calculatedAmount ?? 0),
        mrr: activeSubs.reduce((sum, s) => sum + Number(s.plan.priceMonthly), 0),
        activeSubscriptions: activeSubs.length,
        cancellationsInPeriod,
      },
      series,
      upcoming,
      ranking,
      popularServices,
      recentActivity,
      openAppointments: {
        count: openAppointments.length,
        oldest: openAppointments[0] ?? null,
      },
    };
  }
}
