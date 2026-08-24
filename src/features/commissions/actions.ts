"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function recalculateCommissionsAction(input: { periodMonth: string }) {
  const ctx = await requireAuth();
  const result = await service.recalculateCommissions({ ctx, periodMonth: new Date(input.periodMonth) });
  revalidatePath("/comissoes");
  return result;
}

export async function listServicesForCommissionConfigAction() {
  const ctx = await requireAuth();
  return service.listServicesForCommissionConfig({ ctx });
}

export async function updateServiceCommissionAction(input: {
  serviceId: string;
  commissionServicePct: number | null;
  commissionWalkInPct: number | null;
}) {
  const ctx = await requireAuth();
  const result = await service.updateServiceCommission({ ctx, ...input });
  revalidatePath("/comissoes/configurar");
  return result;
}

export async function markCommissionsPaidAction(input: {
  professionalId: string;
  periodMonth: string;
  type: "SERVICE" | "SUBSCRIPTION";
}) {
  const ctx = await requireAuth();
  const result = await service.markCommissionsPaid({
    ctx,
    professionalId: input.professionalId,
    periodMonth: new Date(input.periodMonth),
    type: input.type,
  });
  revalidatePath("/comissoes");
  return result;
}
