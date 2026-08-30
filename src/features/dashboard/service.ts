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
        select: { scheduledDate: true, status: true, totalPrice: true },
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
        where: { ...unitFilter, scheduledDate: periodStart ? { gte: periodStart } : undefined },
        include: { services: { include: { service: true } }, professional: true },
      });
      const allOpenAppointments = await tx.appointment.findMany({
        where: { ...unitFilter, status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] } },
        include: { client: true, professional: true },
        orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
      });
      return { periodAppointments, allOpenAppointments };
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
      return { clientCounts, pendingCount, activeProfessionals };
    }),
  ]);

  const { recentAppointments, upcoming, recentActivity } = groupA;
  const { periodAppointments, allOpenAppointments } = groupB;
  const { clientCounts, pendingCount, activeProfessionals } = groupC;

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

    const sumPrice = (rows: { totalPrice: unknown }[]) =>
      rows.reduce((sum, r) => sum + Number(r.totalPrice), 0);

    const revenueToday = sumPrice(completedToday);
    const revenueYesterday = sumPrice(completedYesterday);
    const revenueMonth = sumPrice(completedMonth);
    const revenueChangePct =
      revenueYesterday > 0 ? ((revenueToday - revenueYesterday) / revenueYesterday) * 100 : null;

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
      painel: {
        totalClients,
        newClientsInPeriod,
        activeProfessionals,
        commissionsInPeriod: 0, // Fase 4
        mrr: 0, // Fase 4
        activeSubscriptions: 0, // Fase 4
        cancellationsInPeriod,
      },
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
