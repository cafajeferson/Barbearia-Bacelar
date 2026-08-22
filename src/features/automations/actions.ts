"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as jobs from "@/server/services/jobs";

async function requireAdmin() {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "ADMIN") throw new Error("Só admin pode rodar automações manualmente.");
}

export async function runRecurringGeneratorAction() {
  await requireAdmin();
  const result = await jobs.generateRecurringAppointments();
  revalidatePath("/recorrencias");
  revalidatePath("/agenda");
  return result;
}

export async function runNoShowSweepAction() {
  await requireAdmin();
  const result = await jobs.sweepNoShows();
  revalidatePath("/agenda");
  revalidatePath("/em-aberto");
  return result;
}

export async function runReminderSchedulerAction() {
  await requireAdmin();
  return jobs.sendUpcomingReminders();
}

export async function runRetentionCouponGeneratorAction() {
  await requireAdmin();
  const result = await jobs.runRetentionCouponGeneration();
  revalidatePath("/cupons");
  return result;
}

export async function runCommissionApuracaoAction() {
  await requireAdmin();
  const result = await jobs.runCommissionApuracao();
  revalidatePath("/comissoes");
  return result;
}
