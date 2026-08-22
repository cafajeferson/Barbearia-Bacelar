import "dotenv/config";
import { withAppContext, type AppContext } from "../src/server/db/context";
import type { AuthenticatedContext } from "../src/server/auth/getAuthContext";

/**
 * Faxina pontual dos dados de teste acumulados pelas várias execuções do
 * Playwright nesta sessão de debug (sem um harness de reset de DB — ver
 * limitação já documentada em scripts/verify-phaseN.ts). Roda em contexto
 * ADMIN (bypassa as policies de RLS restritivas de PROFESSIONAL/CLIENT via
 * admin_all), fora de um fluxo de app normal.
 */
function ctxFor(role: AppContext["role"], userId: string | null, sessionUserId: string): AuthenticatedContext {
  return { role, userId, sessionUserId };
}

async function main() {
  const bootstrap = ctxFor("ADMIN", null, "bootstrap");
  const adminUser = await withAppContext(bootstrap, (tx) => tx.user.findFirstOrThrow({ where: { role: "ADMIN" } }));
  const admin = ctxFor("ADMIN", null, adminUser.id);

  await withAppContext(admin, async (tx) => {
    const clients = await tx.client.findMany({
      where: {
        OR: [{ name: { startsWith: "Cliente E2E" } }, { name: { startsWith: "Debug " } }],
      },
      select: { id: true },
    });
    const clientIds = clients.map((c) => c.id);
    console.log(`Clientes de teste encontrados: ${clientIds.length}`);
    if (clientIds.length === 0) return;

    const appointments = await tx.appointment.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true },
    });
    const appointmentIds = appointments.map((a) => a.id);
    console.log(`Agendamentos de teste encontrados: ${appointmentIds.length}`);

    if (appointmentIds.length > 0) {
      await tx.appointmentService.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
      await tx.appointmentStatusLog.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
      await tx.couponRedemption.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
      await tx.subscriptionCreditUsage.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
      await tx.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    }
    await tx.recurringSeries.deleteMany({ where: { clientId: { in: clientIds } } });
    await tx.clientSubscription.deleteMany({ where: { clientId: { in: clientIds } } });
    await tx.productSale.deleteMany({ where: { clientId: { in: clientIds } } });
    await tx.notificationLog.deleteMany({ where: { clientId: { in: clientIds } } });
    await tx.coupon.deleteMany({ where: { clientId: { in: clientIds } } });
    await tx.client.deleteMany({ where: { id: { in: clientIds } } });
  });

  console.log("Faxina concluída.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
