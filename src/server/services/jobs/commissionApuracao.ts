import { recalculateCommissions } from "@/features/commissions/service";

const ADMIN_CTX = { role: "ADMIN" as const, userId: null, sessionUserId: "system:commissionApuracao" };

/**
 * Apuração automática: roda no 1º dia do mês, calculando as comissões do
 * mês que ACABOU de terminar (spec: "Apuração no 1º do mês seguinte").
 * Continua idempotente/recalculável manualmente a qualquer momento pela
 * tela de Comissões — este job só garante que a apuração aconteça mesmo
 * que ninguém entre no admin no dia 1º.
 */
export async function runCommissionApuracao() {
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const result = await recalculateCommissions({ ctx: ADMIN_CTX, periodMonth: previousMonth });
  return { periodMonth: previousMonth.toISOString().slice(0, 7), ...result };
}
