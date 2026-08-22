import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

export async function listRecurringSeries(params: { ctx: AuthenticatedContext }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const series = await withAppContext(params.ctx, (tx) =>
    tx.recurringSeries.findMany({
      where: { status: { in: ["ACTIVE", "AT_RISK"] } },
      include: {
        client: true,
        professional: true,
        appointments: {
          where: { scheduledDate: { gte: today }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
          orderBy: { scheduledDate: "asc" },
        },
      },
      orderBy: [{ riskFlag: "desc" }, { nextRunDate: "asc" }],
    }),
  );

  return series.map((s) => ({
    id: s.id,
    client: s.client,
    professional: s.professional,
    intervalDays: s.intervalDays,
    riskFlag: s.riskFlag,
    nextAppointment: s.appointments[0] ?? null,
    remaining: s.appointments.length,
  }));
}
