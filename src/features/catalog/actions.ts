"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function createServiceSectionAction(input: {
  name: string;
  unitId?: string;
  order?: number;
}) {
  const ctx = await requireAuth();
  const section = await service.createServiceSection({ ctx, ...input });
  revalidatePath("/catalogo");
  return section;
}

export async function updateServiceSectionAction(input: {
  sectionId: string;
  name?: string;
  order?: number;
  active?: boolean;
}) {
  const ctx = await requireAuth();
  const section = await service.updateServiceSection({ ctx, ...input });
  revalidatePath("/catalogo");
  return section;
}

export async function deleteServiceSectionAction(input: { sectionId: string }) {
  const ctx = await requireAuth();
  const result = await service.deleteServiceSection({ ctx, ...input });
  revalidatePath("/catalogo");
  return result;
}

export async function createServiceAction(input: {
  sectionId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  imageUrl?: string;
  genderTag?: string;
  featured?: boolean;
  order?: number;
}) {
  const ctx = await requireAuth();
  const result = await service.createService({ ctx, ...input });
  revalidatePath("/catalogo");
  return result;
}

export async function updateServiceAction(input: {
  serviceId: string;
  name?: string;
  description?: string;
  durationMinutes?: number;
  price?: number;
  imageUrl?: string;
  genderTag?: string;
  featured?: boolean;
  order?: number;
  active?: boolean;
}) {
  const ctx = await requireAuth();
  const result = await service.updateService({ ctx, ...input });
  revalidatePath("/catalogo");
  return result;
}

export async function deleteServiceAction(input: { serviceId: string }) {
  const ctx = await requireAuth();
  const result = await service.deleteService({ ctx, ...input });
  revalidatePath("/catalogo");
  return result;
}

export async function listCatalogAction(input: { onlyActive?: boolean } = {}) {
  const ctx = await requireAuth();
  return service.listCatalog({ ctx, ...input });
}
