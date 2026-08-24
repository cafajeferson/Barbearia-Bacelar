import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import type { NoShowAction } from "@/generated/prisma/enums";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar configurações do sistema.");
}

export async function getSystemSettings(params: { ctx: AuthenticatedContext }) {
  return withAppContext(params.ctx, (tx) => tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } }));
}

export async function updateSystemSettings(params: {
  ctx: AuthenticatedContext;
  noShowThreshold: number;
  noShowAction: NoShowAction;
  bookingMinLeadMinutes: number;
  bookingMaxLeadDays: number;
  defaultCommissionServicePct: number;
  defaultCommissionWalkInPct: number;
  defaultCommissionProductPct: number;
  subscriptionGraceDays: number;
}) {
  requireAdmin(params.ctx);
  const { ctx, ...data } = params;
  return withAppContext(ctx, (tx) => tx.systemSettings.update({ where: { id: 1 }, data }));
}
