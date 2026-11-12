"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { adjustStockAction } from "../actions";

/** Entrada (chegou mercadoria) ou saída manual (perda, uso interno, venda fora do app) de estoque. */
export function StockAdjustDialog({ productId, productName, stock }: { productId: string; productName: string; stock: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("1");
  const [isPending, startTransition] = useTransition();
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  const after = mode === "in" ? stock + n : stock - n;

  function save() {
    startTransition(async () => {
      try {
        await adjustStockAction({ productId, delta: mode === "in" ? n : -n });
        toast.success(`Estoque de ${productName}: ${after}`);
        setOpen(false);
        setQty("1");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível ajustar o estoque.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Entrada / saída de estoque">
          <PackagePlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estoque · {productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "in", label: "Entrada", hint: "chegou mercadoria", icon: ArrowDownToLine },
                { value: "out", label: "Saída", hint: "perda, uso, venda fora do app", icon: ArrowUpFromLine },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMode(o.value)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left",
                  mode === o.value ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <o.icon className="h-4 w-4" /> {o.label}
                </span>
                <span className="text-xs text-muted-foreground">{o.hint}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-qty">Quantidade</Label>
            <Input id="stock-qty" type="number" min={1} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <p className="text-sm">
            Estoque: <span className="font-semibold">{stock}</span> →{" "}
            <span className={cn("font-semibold", after < 0 ? "text-destructive" : "text-primary")}>{after}</span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={isPending || n === 0 || after < 0}>
            {isPending ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
