import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar o catálogo.");
}

export async function createServiceSection(params: {
  ctx: AuthenticatedContext;
  name: string;
  unitId?: string;
  order?: number;
}) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.serviceSection.create({
      data: { name: params.name, unitId: params.unitId, order: params.order ?? 0 },
    }),
  );
}

export async function updateServiceSection(params: {
  ctx: AuthenticatedContext;
  sectionId: string;
  name?: string;
  order?: number;
  active?: boolean;
}) {
  requireAdmin(params.ctx);
  const { ctx, sectionId, ...data } = params;
  return withAppContext(ctx, (tx) => tx.serviceSection.update({ where: { id: sectionId }, data }));
}

export async function deleteServiceSection(params: { ctx: AuthenticatedContext; sectionId: string }) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) => tx.serviceSection.delete({ where: { id: params.sectionId } }));
}

export async function createService(params: {
  ctx: AuthenticatedContext;
  sectionId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  imageUrl?: string;
  genderTag?: string;
  featured?: boolean;
  order?: number;
}) {
  requireAdmin(params.ctx);
  const { ctx, ...data } = params;
  return withAppContext(ctx, (tx) => tx.service.create({ data }));
}

export async function updateService(params: {
  ctx: AuthenticatedContext;
  serviceId: string;
  name?: string;
  description?: string;
  durationMinutes?: number;
  price?: number;
  imageUrl?: string;
  genderTag?: string;
  featured?: boolean;
  order?: number;
  active?: boolean;
}) {
  requireAdmin(params.ctx);
  const { ctx, serviceId, ...data } = params;
  return withAppContext(ctx, (tx) => tx.service.update({ where: { id: serviceId }, data }));
}

export async function deleteService(params: { ctx: AuthenticatedContext; serviceId: string }) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) => tx.service.delete({ where: { id: params.serviceId } }));
}

/** Vitrine do catálogo — usada tanto no admin quanto na Home do app do cliente. */
export async function listCatalog(params: { ctx: AuthenticatedContext; onlyActive?: boolean }) {
  return withAppContext(params.ctx, (tx) =>
    tx.serviceSection.findMany({
      where: params.onlyActive ? { active: true } : undefined,
      include: {
        services: {
          where: params.onlyActive ? { active: true } : undefined,
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    }),
  );
}
