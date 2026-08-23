"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { createProductAction, updateProductAction } from "../actions";

type ExistingProduct = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  price: number;
  stock: number;
  lowStockAlert: number;
  commissionPct: number | null;
  active: boolean;
};

export function ProductFormDialog({ product }: { product?: ExistingProduct }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [price, setPrice] = useState(String(product?.price ?? ""));
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [lowStockAlert, setLowStockAlert] = useState(String(product?.lowStockAlert ?? 5));
  const [commissionPct, setCommissionPct] = useState(
    product?.commissionPct != null ? String(product.commissionPct) : "",
  );
  const [active, setActive] = useState(product?.active ?? true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !price) {
      toast.error("Nome e preço são obrigatórios.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name,
        brand: brand || undefined,
        category: category || undefined,
        imageUrl: imageUrl || undefined,
        price: Number(price),
        stock: Number(stock),
        lowStockAlert: Number(lowStockAlert),
        commissionPct: commissionPct ? Number(commissionPct) : undefined,
      };
      if (product) {
        await updateProductAction({ productId: product.id, ...payload, active });
        toast.success("Produto atualizado.");
      } else {
        await createProductAction(payload);
        toast.success("Produto criado.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar produto.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {product ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" /> Novo Produto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-name">Nome</Label>
            <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="product-brand">Marca</Label>
              <Input id="product-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-category">Categoria</Label>
              <Input id="product-category" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="product-price">Preço (R$)</Label>
              <Input id="product-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-stock">Estoque</Label>
              <Input id="product-stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-low-stock">Alerta em</Label>
              <Input id="product-low-stock" type="number" value={lowStockAlert} onChange={(e) => setLowStockAlert(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-image">URL da imagem</Label>
            <Input
              id="product-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="/catalog/produto-x.png"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-commission">Comissão sobre venda (%)</Label>
            <Input id="product-commission" type="number" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} />
          </div>
          {product && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <p className="text-sm font-medium">Ativo</p>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
