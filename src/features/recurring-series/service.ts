import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar recorrências.");
}

export async function getRecurrenciasData(params: { ctx: AuthenticatedContext }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const series = await withAppContext(params.ctx, (tx) =>
    tx.recurringSeries.findMany({
      where: { status: { in: ["PENDING", "ACTIVE"] } },
      include: {
        client: true,
        professional: true,
        services: { include: { service: true } },
        appointments: {
          where: { scheduledDate: { gte: today }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
          orderBy: { scheduledDate: "asc" },
        },
      },
      orderBy: [{ riskFlag: "desc" }, { nextRunDate: "asc" }],
    }),
  );

  const summarize = (s: (typeof series)[number]) => ({
    id: s.id,
    client: s.client,
    professional: s.professional,
    intervalDays: s.intervalDays,
    startTime: s.startTime,
    startDate: s.startDate,
    riskFlag: s.riskFlag,
    createdAt: s.createdAt,
    serviceNames: s.services.map((sv) => sv.service.name),
    pricePerOccurrence: s.services.reduce((sum, sv) => sum + Number(sv.service.price), 0),
    nextAppointment: s.appointments[0] ?? null,
    remaining: s.appointments.length,
  });

  const pendentes = series.filter((s) => s.status === "PENDING").map(summarize);
  const emAtencao = series.filter((s) => s.status === "ACTIVE" && s.riskFlag).map(summarize);
  const saudaveis = series.filter((s) => s.status === "ACTIVE" && !s.riskFlag).map(summarize);

  return { pendentes, emAtencao, saudaveis };
}

export async function approveRecurringSeries(params: { ctx: AuthenticatedContext; seriesId: string }) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, async (tx) => {
    const series = await tx.recurringSeries.findUniqueOrThrow({ where: { id: params.seriesId } });
    if (series.status !== "PENDING") throw new Error("Esse pedido já foi decidido.");
    return tx.recurringSeries.update({ where: { id: params.seriesId }, data: { status: "ACTIVE" } });
  });
}

export async function rejectRecurringSeries(params: { ctx: AuthenticatedContext; seriesId: string }) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, async (tx) => {
    const series = await tx.recurringSeries.findUniqueOrThrow({ where: { id: params.seriesId } });
    if (series.status !== "PENDING") throw new Error("Esse pedido já foi decidido.");
    return tx.recurringSeries.update({ where: { id: params.seriesId }, data: { status: "CANCELLED" } });
  });
}

export async function setRecurringSeriesStatus(params: {
  ctx: AuthenticatedContext;
  seriesId: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
}) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, async (tx) => {
    const series = await tx.recurringSeries.findUniqueOrThrow({ where: { id: params.seriesId } });
    if (series.status === "PENDING") {
      throw new Error("Aceite ou recuse o pedido antes de alterar a série.");
    }
    return tx.recurringSeries.update({
      where: { id: params.seriesId },
      data: { status: params.status, riskFlag: params.status === "ACTIVE" ? false : series.riskFlag },
    });
  });
}
