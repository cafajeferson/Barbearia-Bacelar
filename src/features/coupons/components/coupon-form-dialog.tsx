"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCouponAction } from "../actions";

export function CouponFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [discountValue, setDiscountValue] = useState("10");
  const [validUntil, setValidUntil] = useState("");
  const [usageLimit, setUsageLimit] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!code.trim() || !name.trim() || !validUntil) {
      toast.error("Preencha código, nome e validade.");
      return;
    }
    setSubmitting(true);
    try {
      await createCouponAction({
        code,
        name,
        discountType,
        discountValue: Number(discountValue),
        validFrom: new Date().toISOString(),
        validUntil,
        usageLimit: Number(usageLimit),
      });
      toast.success("Cupom criado.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar cupom.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" /> Novo Cupom
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo cupom</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Código</Label>
              <Input id="coupon-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FIDELIDADE10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-name">Nome</Label>
              <Input id="coupon-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="coupon-type">Tipo</Label>
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as typeof discountType)}>
                <SelectTrigger id="coupon-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">%</SelectItem>
                  <SelectItem value="FIXED">R$</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-value">Valor</Label>
              <Input id="coupon-value" type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-limit">Limite de usos</Label>
              <Input id="coupon-limit" type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-valid-until">Válido até</Label>
            <Input id="coupon-valid-until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Criando..." : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
