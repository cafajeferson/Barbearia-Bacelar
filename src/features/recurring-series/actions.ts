"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function getRecurrenciasDataAction() {
  const ctx = await requireAuth();
  return service.getRecurrenciasData({ ctx });
}

export async function approveRecurringSeriesAction(input: { seriesId: string }) {
  const ctx = await requireAuth();
  const series = await service.approveRecurringSeries({ ctx, ...input });
  revalidatePath("/recorrencias");
  return series;
}

export async function rejectRecurringSeriesAction(input: { seriesId: string }) {
  const ctx = await requireAuth();
  const series = await service.rejectRecurringSeries({ ctx, ...input });
  revalidatePath("/recorrencias");
  return series;
}

export async function setRecurringSeriesStatusAction(input: {
  seriesId: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
}) {
  const ctx = await requireAuth();
  const series = await service.setRecurringSeriesStatus({ ctx, ...input });
  revalidatePath("/recorrencias");
  return series;
}
