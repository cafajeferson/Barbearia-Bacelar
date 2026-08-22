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

  return withAppContext(ctx, async (tx) => {
    const unitFilter = unitId ? { unitId } : {};

    // Uma única conexão por transação — consultas na mesma `tx` rodam em
    // SÉRIE, nunca com Promise.all (senão o driver `pg` intercala queries
    // na mesma conexão, o que é indefinido/depreciado).
    const appointmentsToday = await tx.appointment.count({ where: { ...unitFilter, scheduledDate: today, status: { not: "CANCELLED" } } });
    const appointmentsYesterday = await tx.appointment.count({ where: { ...unitFilter, scheduledDate: yesterday, status: { not: "CANCELLED" } } });
    const completedToday = await tx.appointment.findMany({ where: { ...unitFilter, scheduledDate: today, status: "COMPLETED" }, select: { totalPrice: true } });
    const completedYesterday = await tx.appointment.findMany({ where: { ...unitFilter, scheduledDate: yesterday, status: "COMPLETED" }, select: { totalPrice: true } });
    const completedMonth = await tx.appointment.findMany({ where: { ...unitFilter, scheduledDate: { gte: monthStart }, status: "COMPLETED" }, select: { totalPrice: true } });
    const pendingCount = await tx.appointment.count({ where: { ...unitFilter, status: { in: ["SCHEDULED", "CONFIRMED"] } } });
    const periodAppointments = await tx.appointment.findMany({
      where: { ...unitFilter, scheduledDate: periodStart ? { gte: periodStart } : undefined },
      include: { services: { include: { service: true } }, professional: true },
    });
    const totalClients = await tx.client.count();
    const newClientsInPeriod = await tx.client.count({ where: { createdAt: { gte: periodStart ?? monthStart } } });
    const activeProfessionals = await tx.professional.count({ where: { active: true } });
    const upcoming = await tx.appointment.findMany({
      where: { ...unitFilter, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledDate: { gte: today } },
      include: { client: true, professional: true, services: { include: { service: true } } },
      orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
      take: 5,
    });
    const recentActivity = await tx.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
    const allOpenAppointments = await tx.appointment.findMany({
      where: { ...unitFilter, status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] } },
      include: { client: true, professional: true },
      orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    });

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
  });
}
