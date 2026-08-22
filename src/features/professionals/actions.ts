"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function createProfessionalAction(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  color?: string;
  title?: string;
  unitIds: string[];
  commissionServicePct?: number;
  commissionWalkInPct?: number;
  commissionProductPct?: number;
}) {
  const ctx = await requireAuth();
  const professional = await service.createProfessional({ ctx, ...input });
  revalidatePath("/equipe");
  return professional;
}

export async function updateProfessionalAction(input: {
  professionalId: string;
  name?: string;
  color?: string;
  title?: string;
  active?: boolean;
  commissionServicePct?: number | null;
  commissionWalkInPct?: number | null;
  commissionProductPct?: number | null;
}) {
  const ctx = await requireAuth();
  const professional = await service.updateProfessional({ ctx, ...input });
  revalidatePath("/equipe");
  return professional;
}

export async function deactivateProfessionalAction(input: { professionalId: string }) {
  const ctx = await requireAuth();
  const professional = await service.deactivateProfessional({ ctx, ...input });
  revalidatePath("/equipe");
  return professional;
}

export async function setWeeklyAvailabilityAction(input: {
  professionalId: string;
  weekday: number;
  active: boolean;
  startTime?: string;
  endTime?: string;
}) {
  const ctx = await requireAuth();
  const result = await service.setWeeklyAvailability({ ctx, ...input });
  revalidatePath("/equipe");
  return result;
}

export async function createBlockedSlotAction(input: {
  professionalId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string;
}) {
  const ctx = await requireAuth();
  const slot = await service.createBlockedSlot({ ctx, ...input, date: new Date(input.date) });
  revalidatePath("/agenda");
  revalidatePath("/minha-agenda");
  return slot;
}

export async function deleteBlockedSlotAction(input: { blockedSlotId: string }) {
  const ctx = await requireAuth();
  const result = await service.deleteBlockedSlot({ ctx, ...input });
  revalidatePath("/agenda");
  revalidatePath("/minha-agenda");
  return result;
}

export async function listProfessionalsAction(input: { search?: string } = {}) {
  const ctx = await requireAuth();
  return service.listProfessionals({ ctx, ...input });
}

export async function listActiveProfessionalsForBookingAction() {
  const ctx = await requireAuth();
  return service.listActiveProfessionalsForBooking({ ctx });
}

export async function getOwnDayDataAction(input: { date: string }) {
  const ctx = await requireAuth();
  return service.getOwnDayData({ ctx, date: new Date(input.date) });
}

export async function getOwnWeekDataAction(input: { startDate: string }) {
  const ctx = await requireAuth();
  return service.getOwnWeekData({ ctx, startDate: new Date(input.startDate) });
}
