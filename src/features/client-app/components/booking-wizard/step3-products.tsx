"use client";

import Image from "next/image";
import { Minus, Plus, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/shared/lib/format";
import type { WizardProduct } from "./types";

export function Step3Products({
  products,
  quantities,
  onQuantityChange,
  onContinue,
  onBack,
}: {
  products: WizardProduct[];
  /** productId -> quantidade escolhida */
  quantities: Record<string, number>;
  onQuantityChange: (productId: string, quantity: number) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Vai precisar de algum produto?</h1>
      <p className="text-sm text-muted-foreground">
        Precisando de algum produto, deixaremos separado para você retirar no dia do atendimento.
      </p>

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
          <PackageOpen className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum produto disponível no momento.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((product) => {
            const qty = quantities[product.id] ?? 0;
            return (
              <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-3">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-secondary">
                      <PackageOpen className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.brand ? `${product.brand} · ` : ""}
                      {formatBRL(product.price)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={qty === 0}
                    onClick={() => onQuantityChange(product.id, Math.max(0, qty - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-5 text-center text-sm font-medium">{qty}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onQuantityChange(product.id, qty + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1" onClick={onContinue}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
