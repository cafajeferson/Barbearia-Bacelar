"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function createProductAction(input: {
  name: string;
  brand?: string;
  category?: string;
  sku?: string;
  imageUrl?: string;
  price: number;
  cost?: number;
  stock?: number;
  lowStockAlert?: number;
  commissionPct?: number;
}) {
  const ctx = await requireAuth();
  const product = await service.createProduct({ ctx, ...input });
  revalidatePath("/produtos");
  return product;
}

export async function updateProductAction(input: {
  productId: string;
  name?: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  price?: number;
  cost?: number;
  stock?: number;
  lowStockAlert?: number;
  commissionPct?: number;
  active?: boolean;
}) {
  const ctx = await requireAuth();
  const product = await service.updateProduct({ ctx, ...input });
  revalidatePath("/produtos");
  return product;
}

export async function adjustStockAction(input: { productId: string; delta: number }) {
  const ctx = await requireAuth();
  const product = await service.adjustStock({ ctx, ...input });
  revalidatePath("/produtos");
  return product;
}

export async function listProductsAction(input: { search?: string; includeInactive?: boolean } = {}) {
  const ctx = await requireAuth();
  return service.listProducts({ ctx, ...input });
}

export async function getInventorySummaryAction() {
  const ctx = await requireAuth();
  return service.getInventorySummary({ ctx });
}
