"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import * as service from "./service";

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  return ctx;
}

export async function createUnitAction(input: service.UnitInput) {
  const ctx = await requireAuth();
  const unit = await service.createUnit({ ctx, ...input });
  revalidatePath("/configuracoes");
  return { id: unit.id };
}

export async function updateUnitAction(input: service.UnitInput & { unitId: string }) {
  const ctx = await requireAuth();
  const unit = await service.updateUnit({ ctx, ...input });
  revalidatePath("/configuracoes");
  return { id: unit.id };
}
