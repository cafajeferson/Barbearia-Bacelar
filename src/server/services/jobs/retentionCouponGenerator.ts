import { withAppContext } from "@/server/db/context";
import { generateRetentionCoupons } from "@/features/coupons/service";

const ADMIN_CTX = { role: "ADMIN" as const, userId: null, sessionUserId: "system:retentionCouponGenerator" };

/** Job wrapper — a lógica de verdade já existe e é testada desde a Fase 4 (uso manual). */
export async function runRetentionCouponGeneration() {
  const settings = await withAppContext(ADMIN_CTX, (tx) =>
    tx.systemSettings.findUniqueOrThrow({ where: { id: 1 } }),
  );
  const created = await generateRetentionCoupons({
    ctx: ADMIN_CTX,
    daysInactive: settings.retentionCouponDaysInactive,
  });
  return { couponsGenerated: created.length };
}
