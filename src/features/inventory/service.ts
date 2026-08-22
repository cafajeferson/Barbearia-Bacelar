import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar produtos.");
}

export async function createProduct(params: {
  ctx: AuthenticatedContext;
  name: string;
  brand?: string;
  category?: string;
  sku?: string;
  price: number;
  cost?: number;
  stock?: number;
  lowStockAlert?: number;
  commissionPct?: number;
}) {
  requireAdmin(params.ctx);
  const { ctx, ...data } = params;
  return withAppContext(ctx, (tx) => tx.product.create({ data }));
}

export async function updateProduct(params: {
  ctx: AuthenticatedContext;
  productId: string;
  name?: string;
  brand?: string;
  category?: string;
  price?: number;
  cost?: number;
  stock?: number;
  lowStockAlert?: number;
  commissionPct?: number;
  active?: boolean;
}) {
  requireAdmin(params.ctx);
  const { ctx, productId, ...data } = params;
  return withAppContext(ctx, (tx) => tx.product.update({ where: { id: productId }, data }));
}

export async function adjustStock(params: {
  ctx: AuthenticatedContext;
  productId: string;
  delta: number;
}) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.product.update({
      where: { id: params.productId },
      data: { stock: { increment: params.delta } },
    }),
  );
}

export async function listProducts(params: {
  ctx: AuthenticatedContext;
  search?: string;
  includeInactive?: boolean;
}) {
  return withAppContext(params.ctx, (tx) =>
    tx.product.findMany({
      where: {
        active: params.includeInactive ? undefined : true,
        name: params.search ? { contains: params.search, mode: "insensitive" } : undefined,
      },
      orderBy: { name: "asc" },
    }),
  );
}

export async function getInventorySummary(params: { ctx: AuthenticatedContext }) {
  return withAppContext(params.ctx, async (tx) => {
    const products = await tx.product.findMany({ where: { active: true } });
    const totalProducts = products.length;
    const stockValue = products.reduce((sum, p) => sum + Number(p.price) * p.stock, 0);
    const lowStockCount = products.filter((p) => p.stock <= p.lowStockAlert).length;
    return { totalProducts, stockValue, lowStockCount };
  });
}
