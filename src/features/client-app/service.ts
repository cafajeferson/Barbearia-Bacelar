import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

/** Últimos serviços já realizados pelo cliente — carrossel "Agendar Novamente" da Home. */
export async function getRecentServices(params: { ctx: AuthenticatedContext }) {
  if (params.ctx.role !== "CLIENT" || !params.ctx.userId) return [];

  return withAppContext(params.ctx, async (tx) => {
    const recentAppointments = await tx.appointment.findMany({
      where: { clientId: params.ctx.userId!, status: { in: ["COMPLETED", "SCHEDULED", "CONFIRMED"] } },
      include: { services: { include: { service: true } } },
      orderBy: { scheduledDate: "desc" },
      take: 10,
    });

    const seen = new Set<string>();
    const recent: { id: string; name: string; price: number; durationMinutes: number; imageUrl: string | null }[] = [];
    for (const a of recentAppointments) {
      for (const as of a.services) {
        if (seen.has(as.serviceId)) continue;
        seen.add(as.serviceId);
        recent.push({
          id: as.service.id,
          name: as.service.name,
          price: Number(as.service.price),
          durationMinutes: as.service.durationMinutes,
          imageUrl: as.service.imageUrl,
        });
        if (recent.length >= 5) return recent;
      }
    }
    return recent;
  });
}

/** Notificações in-app do cliente logado (sino). */
export async function getOwnNotifications(params: { ctx: AuthenticatedContext }) {
  if (params.ctx.role !== "CLIENT" || !params.ctx.userId) return [];
  return withAppContext(params.ctx, (tx) =>
    tx.notificationLog.findMany({
      where: { clientId: params.ctx.userId! },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  );
}

export async function markNotificationRead(params: { ctx: AuthenticatedContext; notificationId: string }) {
  return withAppContext(params.ctx, async (tx) => {
    const notif = await tx.notificationLog.findUniqueOrThrow({ where: { id: params.notificationId } });
    if (notif.clientId !== params.ctx.userId) throw new Error("Notificação não encontrada.");
    return tx.notificationLog.update({
      where: { id: params.notificationId },
      data: { status: "READ", readAt: new Date() },
    });
  });
}
