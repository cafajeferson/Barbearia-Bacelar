"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";
import type { NoShowAction } from "@/generated/prisma/enums";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function getSystemSettingsAction() {
  const ctx = await requireAuth();
  return service.getSystemSettings({ ctx });
}

export async function updateSystemSettingsAction(input: {
  noShowThreshold: number;
  noShowAction: NoShowAction;
  bookingMinLeadMinutes: number;
  bookingMaxLeadDays: number;
  defaultCommissionServicePct: number;
  defaultCommissionWalkInPct: number;
  defaultCommissionProductPct: number;
  subscriptionGraceDays: number;
}) {
  const ctx = await requireAuth();
  const result = await service.updateSystemSettings({ ctx, ...input });
  revalidatePath("/configuracoes");
  return result;
}
