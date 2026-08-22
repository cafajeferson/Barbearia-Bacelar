"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function createCouponAction(input: {
  code: string;
  name: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  validFrom: string;
  validUntil: string;
  usageLimit: number;
  clientId?: string;
}) {
  const ctx = await requireAuth();
  const coupon = await service.createCoupon({
    ctx,
    ...input,
    validFrom: new Date(input.validFrom),
    validUntil: new Date(input.validUntil),
  });
  revalidatePath("/cupons");
  return coupon;
}

export async function updateCouponAction(input: {
  couponId: string;
  status?: "PENDING" | "ACTIVE" | "USED" | "EXPIRED" | "DISABLED";
}) {
  const ctx = await requireAuth();
  const coupon = await service.updateCoupon({ ctx, ...input });
  revalidatePath("/cupons");
  return coupon;
}

export async function deleteCouponAction(input: { couponId: string }) {
  const ctx = await requireAuth();
  const result = await service.deleteCoupon({ ctx, ...input });
  revalidatePath("/cupons");
  return result;
}

export async function listCouponsAction(input: { onlyActive?: boolean } = {}) {
  const ctx = await requireAuth();
  return service.listCoupons({ ctx, ...input });
}

export async function generateRetentionCouponsAction(input: { daysInactive: number }) {
  const ctx = await requireAuth();
  const result = await service.generateRetentionCoupons({ ctx, ...input });
  revalidatePath("/cupons");
  return result;
}
