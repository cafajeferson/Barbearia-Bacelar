import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar promoções.");
}

export async function createPromotion(params: {
  ctx: AuthenticatedContext;
  name: string;
  imageUrl?: string;
  tag?: string;
  startDate: Date;
  endDate: Date;
  services: { serviceId: string; originalPrice: number; promoPrice: number }[];
}) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.promotion.create({
      data: {
        name: params.name,
        imageUrl: params.imageUrl,
        tag: params.tag,
        startDate: params.startDate,
        endDate: params.endDate,
        services: { create: params.services },
      },
    }),
  );
}

export async function updatePromotion(params: {
  ctx: AuthenticatedContext;
  promotionId: string;
  name?: string;
  tag?: string;
  startDate?: Date;
  endDate?: Date;
  active?: boolean;
}) {
  requireAdmin(params.ctx);
  const { ctx, promotionId, ...data } = params;
  return withAppContext(ctx, (tx) => tx.promotion.update({ where: { id: promotionId }, data }));
}

export async function deletePromotion(params: { ctx: AuthenticatedContext; promotionId: string }) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) => tx.promotion.delete({ where: { id: params.promotionId } }));
}

export async function listPromotions(params: { ctx: AuthenticatedContext }) {
  return withAppContext(params.ctx, (tx) =>
    tx.promotion.findMany({
      include: { services: { include: { service: true } } },
      orderBy: { startDate: "desc" },
    }),
  );
}
