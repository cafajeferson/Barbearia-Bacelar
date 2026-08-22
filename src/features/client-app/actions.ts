"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function getRecentServicesAction() {
  const ctx = await requireAuth();
  return service.getRecentServices({ ctx });
}

export async function getOwnNotificationsAction() {
  const ctx = await requireAuth();
  return service.getOwnNotifications({ ctx });
}

export async function markNotificationReadAction(input: { notificationId: string }) {
  const ctx = await requireAuth();
  const result = await service.markNotificationRead({ ctx, ...input });
  revalidatePath("/inicio");
  return result;
}
