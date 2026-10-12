"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { parseLocalDate } from "@/shared/lib/time";
import * as service from "./service";

export async function markMonthCommissionsPaidAction(input: { periodMonth: string; professionalId?: string }) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Não autenticado.");
  const result = await service.markMonthCommissionsPaid({
    ctx,
    periodMonth: parseLocalDate(input.periodMonth),
    professionalId: input.professionalId,
  });
  revalidatePath("/fechamento");
  revalidatePath("/comissoes");
  return { updated: result.count };
}
