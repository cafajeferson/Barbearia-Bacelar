"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function createClientAction(input: {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  isWalkIn?: boolean;
}) {
  const ctx = await requireAuth();
  const client = await service.createClient({ ctx, ...input });
  revalidatePath("/clientes");
  return client;
}

export async function updateClientAction(input: {
  clientId: string;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  blocked?: boolean;
}) {
  const ctx = await requireAuth();
  const client = await service.updateClient({ ctx, ...input });
  revalidatePath("/clientes");
  return client;
}

export async function listClientsAction(input: {
  search?: string;
  filter?: "SUBSCRIBERS" | "WITH_NO_SHOWS" | "BLOCKED";
}) {
  const ctx = await requireAuth();
  return service.listClients({ ctx, ...input });
}

export async function listInactiveClientsAction(input: { daysInactive: number }) {
  const ctx = await requireAuth();
  return service.listInactiveClients({ ctx, ...input });
}
