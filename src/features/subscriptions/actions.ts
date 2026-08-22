"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function createSubscriptionPlanAction(input: {
  name: string;
  priceMonthly: number;
  creditLimitPerMonth: number;
  billingRule?: string;
  serviceIds: string[];
}) {
  const ctx = await requireAuth();
  const plan = await service.createSubscriptionPlan({ ctx, ...input });
  revalidatePath("/assinaturas");
  return plan;
}

export async function updateSubscriptionPlanAction(input: {
  planId: string;
  name?: string;
  priceMonthly?: number;
  creditLimitPerMonth?: number;
  billingRule?: string;
  active?: boolean;
}) {
  const ctx = await requireAuth();
  const plan = await service.updateSubscriptionPlan({ ctx, ...input });
  revalidatePath("/assinaturas");
  return plan;
}

export async function listSubscriptionPlansAction() {
  const ctx = await requireAuth();
  return service.listSubscriptionPlans({ ctx });
}

export async function requestClientSubscriptionAction(input: { clientId: string; planId: string }) {
  const ctx = await requireAuth();
  const sub = await service.requestClientSubscription({ ctx, ...input });
  revalidatePath("/assinaturas");
  return sub;
}

export async function approveClientSubscriptionAction(input: { subscriptionId: string }) {
  const ctx = await requireAuth();
  const sub = await service.approveClientSubscription({ ctx, ...input });
  revalidatePath("/assinaturas");
  return sub;
}

export async function rejectClientSubscriptionAction(input: { subscriptionId: string }) {
  const ctx = await requireAuth();
  const sub = await service.rejectClientSubscription({ ctx, ...input });
  revalidatePath("/assinaturas");
  return sub;
}

export async function setClientSubscriptionStatusAction(input: {
  subscriptionId: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
}) {
  const ctx = await requireAuth();
  const sub = await service.setClientSubscriptionStatus({ ctx, ...input });
  revalidatePath("/assinaturas");
  return sub;
}

export async function addManualCreditUsageAction(input: { subscriptionId: string }) {
  const ctx = await requireAuth();
  const sub = await service.addManualCreditUsage({ ctx, ...input });
  revalidatePath("/assinaturas");
  return sub;
}

export async function cancelOwnSubscriptionAction(input: { subscriptionId: string }) {
  const ctx = await requireAuth();
  const sub = await service.cancelOwnSubscription({ ctx, ...input });
  revalidatePath("/plano");
  return sub;
}

export async function getOwnSubscriptionsAction() {
  const ctx = await requireAuth();
  return service.getOwnSubscriptions({ ctx });
}
