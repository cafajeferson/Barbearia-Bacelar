"use client";

import { useEffect, useState } from "react";
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
import { listCatalogAction } from "@/features/catalog/actions";
import { createPromotionAction } from "../actions";

type ServiceOption = { id: string; name: string; price: number };

export function PromotionFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("Geral");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    listCatalogAction({ onlyActive: true }).then((sections) => {
      setServices(sections.flatMap((s) => s.services.map((sv) => ({ id: sv.id, name: sv.name, price: Number(sv.price) }))));
    });
  }, [open]);

  function toggleService(s: ServiceOption) {
    setSelected((prev) => {
      const next = { ...prev };
      if (s.id in next) delete next[s.id];
      else next[s.id] = s.price;
      return next;
    });
  }

  async function handleSubmit() {
    const serviceIds = Object.keys(selected);
    if (!name.trim() || !endDate || serviceIds.length === 0) {
      toast.error("Preencha nome, período e ao menos um serviço.");
      return;
    }
    setSubmitting(true);
    try {
      await createPromotionAction({
        name,
        tag,
        startDate,
        endDate,
        services: serviceIds.map((serviceId) => {
          const original = services.find((s) => s.id === serviceId)!.price;
          return { serviceId, originalPrice: original, promoPrice: selected[serviceId] };
        }),
      });
      toast.success("Promoção criada.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar promoção.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" /> Nova Promoção
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova promoção</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="promo-name">Nome</Label>
              <Input id="promo-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo-tag">Tag</Label>
              <Input id="promo-tag" value={tag} onChange={(e) => setTag(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="promo-start">Início</Label>
              <Input id="promo-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo-end">Fim</Label>
              <Input id="promo-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Serviços em promoção</Label>
            <div className="space-y-2">
              {services.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleService(s)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-left text-sm ${
                      s.id in selected ? "border-primary bg-primary/10" : "text-muted-foreground"
                    }`}
                  >
                    {s.name} <span className="text-xs">(de R${s.price})</span>
                  </button>
                  {s.id in selected && (
                    <Input
                      type="number"
                      className="w-24"
                      value={selected[s.id]}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))}
                    />
                  )}
                </div>
              ))}
            </div>
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
