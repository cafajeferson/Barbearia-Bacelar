import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

function requireStaff(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN" && ctx.role !== "PROFESSIONAL") {
    throw new Error("Só admin/profissional podem gerenciar clientes.");
  }
}

export async function createClient(params: {
  ctx: AuthenticatedContext;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  isWalkIn?: boolean;
}) {
  requireStaff(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.client.create({
      data: {
        name: params.name,
        phone: params.phone,
        email: params.email,
        notes: params.notes,
        isWalkIn: params.isWalkIn ?? false,
      },
    }),
  );
}

export async function updateClient(params: {
  ctx: AuthenticatedContext;
  clientId: string;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  blocked?: boolean;
}) {
  requireStaff(params.ctx);
  const { ctx, clientId, ...data } = params;
  return withAppContext(ctx, (tx) =>
    tx.client.update({ where: { id: clientId }, data }),
  );
}

export async function listClients(params: {
  ctx: AuthenticatedContext;
  search?: string;
  filter?: "SUBSCRIBERS" | "WITH_NO_SHOWS" | "BLOCKED";
}) {
  const clients = await withAppContext(params.ctx, (tx) =>
    tx.client.findMany({
      where: {
        AND: [
          params.search
            ? {
                OR: [
                  { name: { contains: params.search, mode: "insensitive" } },
                  { phone: { contains: params.search } },
                ],
              }
            : {},
          params.filter === "WITH_NO_SHOWS" ? { noShowCount: { gt: 0 } } : {},
          params.filter === "BLOCKED" ? { blocked: true } : {},
          params.filter === "SUBSCRIBERS"
            ? { subscriptions: { some: { status: "ACTIVE" } } }
            : {},
        ],
      },
      include: {
        _count: { select: { appointments: true } },
        subscriptions: { where: { status: "ACTIVE" }, take: 1 },
        appointments: { select: { totalPrice: true, status: true, scheduledDate: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  return clients.map((c) => {
    const revenueTotal = c.appointments
      .filter((a) => a.status === "COMPLETED")
      .reduce((sum, a) => sum + Number(a.totalPrice), 0);
    const lastAppointmentDate = c.appointments.reduce<Date | null>(
      (latest, a) => (!latest || a.scheduledDate > latest ? a.scheduledDate : latest),
      null,
    );
    const { appointments, ...rest } = c;
    void appointments;
    return { ...rest, revenueTotal, lastAppointmentDate };
  });
}

/** Clientes sem agendamento há X dias — alimenta o cupom de retorno automático (Fase 7). */
export async function listInactiveClients(params: {
  ctx: AuthenticatedContext;
  daysInactive: number;
}) {
  const since = new Date();
  since.setDate(since.getDate() - params.daysInactive);

  return withAppContext(params.ctx, (tx) =>
    tx.client.findMany({
      where: {
        blocked: false,
        appointments: { none: { scheduledDate: { gte: since } } },
      },
      orderBy: { name: "asc" },
    }),
  );
}
