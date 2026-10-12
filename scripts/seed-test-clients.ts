/**
 * Cria N clientes de teste (cliente1@bacelar.dev ... clienteN@bacelar.dev)
 * com login por e-mail e senha, pra testes manuais do app do cliente.
 *
 *   npx tsx scripts/seed-test-clients.ts <quantidade> <senha>
 *   npx tsx scripts/seed-test-clients.ts --remover      -> apaga todos eles
 *
 * A senha vem pela linha de comando de propósito — não fica no repositório.
 * Idempotente: quem já existe é pulado (ou tem só a senha atualizada).
 */
import "dotenv/config";
import { createSupabaseAdminClient } from "../src/server/supabase/admin";
import { withAppContext } from "../src/server/db/context";
import { prisma } from "../src/server/db/client";

const ADMIN = { role: "ADMIN" as const, userId: null };
const emailFor = (n: number) => `cliente${n}@bacelar.dev`;
const EMAIL_PATTERN = /^cliente\d+@bacelar\.dev$/;

async function remove() {
  const admin = createSupabaseAdminClient();
  const users = await withAppContext(ADMIN, (tx) =>
    tx.user.findMany({
      where: { email: { startsWith: "cliente", endsWith: "@bacelar.dev" } },
      select: { id: true, email: true, authUserId: true, client: { select: { id: true } } },
    }),
  );
  const targets = users.filter((u) => EMAIL_PATTERN.test(u.email));
  for (const u of targets) {
    if (u.client) {
      const clientId = u.client.id;
      await withAppContext(ADMIN, async (tx) => {
        const appts = (await tx.appointment.findMany({ where: { clientId }, select: { id: true } })).map((a) => a.id);
        if (appts.length > 0) {
          await tx.appointmentService.deleteMany({ where: { appointmentId: { in: appts } } });
          await tx.appointmentProduct.deleteMany({ where: { appointmentId: { in: appts } } });
          await tx.appointmentStatusLog.deleteMany({ where: { appointmentId: { in: appts } } });
          await tx.couponRedemption.deleteMany({ where: { appointmentId: { in: appts } } });
          await tx.subscriptionCreditUsage.deleteMany({ where: { appointmentId: { in: appts } } });
          await tx.appointment.deleteMany({ where: { id: { in: appts } } });
        }
        await tx.recurringSeries.deleteMany({ where: { clientId } });
        await tx.clientSubscription.deleteMany({ where: { clientId } });
        await tx.productSale.deleteMany({ where: { clientId } });
        await tx.notificationLog.deleteMany({ where: { clientId } });
        await tx.coupon.deleteMany({ where: { clientId } });
        await tx.client.delete({ where: { id: clientId } });
      });
    }
    await withAppContext(ADMIN, (tx) => tx.user.delete({ where: { id: u.id } }));
    if (u.authUserId) await admin.auth.admin.deleteUser(u.authUserId);
  }
  console.log(`Removidos: ${targets.length} cliente(s) de teste.`);
}

async function seed(count: number, password: string) {
  const admin = createSupabaseAdminClient();
  let created = 0;
  let updated = 0;
  for (let n = 1; n <= count; n++) {
    const email = emailFor(n);
    const name = `Cliente ${n}`;
    const existing = await withAppContext(ADMIN, (tx) =>
      tx.user.findUnique({ where: { email }, select: { id: true, authUserId: true } }),
    );
    if (existing?.authUserId) {
      const { error } = await admin.auth.admin.updateUserById(existing.authUserId, { password });
      if (error) throw new Error(`${email}: ${error.message}`);
      updated++;
      continue;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "CLIENT" },
      user_metadata: { full_name: name },
    });
    if (error || !data.user) throw new Error(`${email}: ${error?.message ?? "sem usuário"}`);
    const authUserId = data.user.id;
    await withAppContext(ADMIN, async (tx) => {
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { authUserId } })
        : await tx.user.create({ data: { email, name, authUserId, role: "CLIENT" } });
      const hasClient = await tx.client.findFirst({ where: { userId: user.id }, select: { id: true } });
      if (!hasClient) await tx.client.create({ data: { userId: user.id, name, email } });
    });
    created++;
  }
  console.log(`Criados: ${created} | já existiam (senha atualizada): ${updated} | de ${emailFor(1)} a ${emailFor(count)}`);
}

async function main() {
  const [first, second] = process.argv.slice(2);
  if (first === "--remover") return remove();
  const count = Number(first);
  if (!Number.isInteger(count) || count < 1 || !second) {
    console.log("uso: npx tsx scripts/seed-test-clients.ts <quantidade> <senha>  |  --remover");
    process.exit(1);
  }
  await seed(count, second);
}

main()
  .catch((e) => {
    console.error("ERRO:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
