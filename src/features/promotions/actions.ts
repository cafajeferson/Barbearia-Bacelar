"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function createPromotionAction(input: {
  name: string;
  imageUrl?: string;
  tag?: string;
  startDate: string;
  endDate: string;
  services: { serviceId: string; originalPrice: number; promoPrice: number }[];
}) {
  const ctx = await requireAuth();
  const promotion = await service.createPromotion({
    ctx,
    ...input,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
  });
  revalidatePath("/promocoes");
  return promotion;
}

export async function updatePromotionAction(input: {
  promotionId: string;
  name?: string;
  tag?: string;
  active?: boolean;
}) {
  const ctx = await requireAuth();
  const promotion = await service.updatePromotion({ ctx, ...input });
  revalidatePath("/promocoes");
  return promotion;
}

export async function deletePromotionAction(input: { promotionId: string }) {
  const ctx = await requireAuth();
  const result = await service.deletePromotion({ ctx, ...input });
  revalidatePath("/promocoes");
  return result;
}

export async function listPromotionsAction() {
  const ctx = await requireAuth();
  return service.listPromotions({ ctx });
}
