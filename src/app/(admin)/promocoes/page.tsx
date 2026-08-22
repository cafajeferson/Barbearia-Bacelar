import { getAuthContext } from "@/server/auth/getAuthContext";
import { listPromotions } from "@/features/promotions/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PromotionFormDialog } from "@/features/promotions/components/promotion-form-dialog";
import { PromotionActions } from "@/features/promotions/components/promotion-actions";
import { formatBRL } from "@/shared/lib/format";

export default async function PromocoesPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const promotions = await listPromotions({ ctx });

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Promoções</h1>
          <p className="text-muted-foreground">{promotions.length} cadastradas</p>
        </div>
        <PromotionFormDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {promotions.map((p) => (
          <Card
            key={p.id}
            className="overflow-hidden bg-gradient-to-br from-primary/20 to-card p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <Badge className="bg-primary/20 text-primary">{p.tag ?? "Geral"}</Badge>
              <PromotionActions promotionId={p.id} active={p.active} />
            </div>
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {new Intl.DateTimeFormat("pt-BR").format(p.startDate)} –{" "}
              {new Intl.DateTimeFormat("pt-BR").format(p.endDate)}
            </p>
            <div className="space-y-1">
              {p.services.map((ps) => (
                <div key={ps.serviceId} className="flex items-center justify-between text-sm">
                  <span>{ps.service.name}</span>
                  <span>
                    <span className="mr-1 text-muted-foreground line-through">
                      {formatBRL(Number(ps.originalPrice))}
                    </span>
                    <span className="font-semibold text-primary">{formatBRL(Number(ps.promoPrice))}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
