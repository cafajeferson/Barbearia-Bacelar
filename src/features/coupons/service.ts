import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar cupons.");
}

function slugifyName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas de combinação após NFD)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function ddmmaa(date: Date) {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear().toString().slice(-2);
  return `${d}${m}${y}`;
}

export async function createCoupon(params: {
  ctx: AuthenticatedContext;
  code: string;
  name: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  validFrom: Date;
  validUntil: Date;
  usageLimit: number;
  clientId?: string;
}) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.coupon.create({
      data: {
        code: params.code.toUpperCase(),
        name: params.name,
        discountType: params.discountType,
        discountValue: params.discountValue,
        validFrom: params.validFrom,
        validUntil: params.validUntil,
        usageLimit: params.usageLimit,
        clientId: params.clientId,
        type: "MANUAL",
        status: "ACTIVE",
        createdBy: params.ctx.sessionUserId,
      },
    }),
  );
}

export async function updateCoupon(params: {
  ctx: AuthenticatedContext;
  couponId: string;
  status?: "PENDING" | "ACTIVE" | "USED" | "EXPIRED" | "DISABLED";
  validUntil?: Date;
}) {
  requireAdmin(params.ctx);
  const { ctx, couponId, ...data } = params;
  return withAppContext(ctx, (tx) => tx.coupon.update({ where: { id: couponId }, data }));
}

export async function deleteCoupon(params: { ctx: AuthenticatedContext; couponId: string }) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) => tx.coupon.delete({ where: { id: params.couponId } }));
}

export async function listCoupons(params: { ctx: AuthenticatedContext; onlyActive?: boolean }) {
  return withAppContext(params.ctx, (tx) =>
    tx.coupon.findMany({
      where: params.onlyActive ? { status: "ACTIVE" } : undefined,
      include: { client: true },
      orderBy: { createdAt: "desc" },
    }),
  );
}

/**
 * Gera cupons de retorno (RETORNO-NOME-DDMMAA, 10% por 7 dias) para clientes
 * sem agendamento há X dias que ainda não têm um cupom de retorno em aberto.
 * Disparado manualmente aqui na Fase 4; na Fase 7 vira job agendado
 * (Edge Function + pg_cron), chamando esta mesma função.
 */
export async function generateRetentionCoupons(params: { ctx: AuthenticatedContext; daysInactive: number }) {
  requireAdmin(params.ctx);
  const since = new Date();
  since.setDate(since.getDate() - params.daysInactive);
  const now = new Date();
  const validUntil = new Date(now);
  validUntil.setDate(validUntil.getDate() + 7);

  return withAppContext(params.ctx, async (tx) => {
    const inactiveClients = await tx.client.findMany({
      where: {
        blocked: false,
        appointments: { none: { scheduledDate: { gte: since } } },
        coupons: { none: { type: "AUTO_RETENTION", status: { in: ["ACTIVE", "PENDING"] } } },
      },
    });

    // O código é único no banco, e dois clientes com o mesmo nome (ou o
    // mesmo cliente recebendo um 2º cupom no mesmo dia, depois de usar o 1º)
    // geravam o MESMO código — a violação de unicidade derrubava a transação
    // inteira e ninguém recebia cupom naquele dia, todos os dias. Colisão
    // agora ganha um sufixo (-2, -3...).
    const today = ddmmaa(now);
    const taken = new Set(
      (
        await tx.coupon.findMany({
          where: { code: { startsWith: "RETORNO-", contains: `-${today}` } },
          select: { code: true },
        })
      ).map((c) => c.code),
    );

    const created: { clientId: string; code: string }[] = [];
    for (const client of inactiveClients) {
      const base = `RETORNO-${slugifyName(client.name)}-${today}`;
      let code = base;
      for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;
      taken.add(code);
      const coupon = await tx.coupon.create({
        data: {
          code,
          name: "Cupom de retorno",
          discountType: "PERCENT",
          discountValue: 10,
          type: "AUTO_RETENTION",
          status: "ACTIVE",
          validFrom: now,
          validUntil,
          usageLimit: 1,
          clientId: client.id,
        },
      });
      await tx.notificationLog.create({
        data: {
          clientId: client.id,
          channel: "IN_APP",
          template: "retention_coupon",
          payload: { code: coupon.code, discountValue: 10, validUntil: validUntil.toISOString() },
          status: "QUEUED",
        },
      });
      created.push({ clientId: client.id, code });
    }
    return created;
  });
}
