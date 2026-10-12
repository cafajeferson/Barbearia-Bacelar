import type { AuthenticatedContext } from "@/server/auth/getAuthContext";
import { withAppContext } from "@/server/db/context";
import { invalidateTtlCache } from "@/server/db/ttl-cache";

function requireAdmin(ctx: AuthenticatedContext) {
  if (ctx.role !== "ADMIN") throw new Error("Só admin pode gerenciar unidades.");
}

export type UnitInput = { name: string; address: string; phone?: string | null; active: boolean };

function clean(input: UnitInput) {
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name) throw new Error("Informe o nome da unidade.");
  if (!address) throw new Error("Informe o endereço da unidade.");
  return { name, address, phone: input.phone?.trim() || null, active: input.active };
}

export async function listUnits(params: { ctx: AuthenticatedContext }) {
  requireAdmin(params.ctx);
  return withAppContext(params.ctx, (tx) =>
    tx.unit.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        active: true,
        _count: { select: { professionals: true } },
      },
    }),
  );
}

export async function createUnit(params: { ctx: AuthenticatedContext } & UnitInput) {
  requireAdmin(params.ctx);
  const { ctx, ...input } = params;
  const unit = await withAppContext(ctx, (tx) => tx.unit.create({ data: clean(input) }));
  // Layouts e a tela de agendar guardam a lista de unidades em cache de memória.
  invalidateTtlCache();
  return unit;
}

export async function updateUnit(params: { ctx: AuthenticatedContext; unitId: string } & UnitInput) {
  requireAdmin(params.ctx);
  const { ctx, unitId, ...input } = params;
  const data = clean(input);
  const unit = await withAppContext(ctx, async (tx) => {
    if (!data.active) {
      // Nunca deixar o sistema sem nenhuma unidade ativa — agenda, equipe e
      // o app do cliente partem do princípio de que existe ao menos uma.
      const otherActive = await tx.unit.count({ where: { active: true, id: { not: unitId } } });
      if (otherActive === 0) throw new Error("Não dá pra desativar a única unidade ativa.");
    }
    return tx.unit.update({ where: { id: unitId }, data });
  });
  invalidateTtlCache();
  return unit;
}
