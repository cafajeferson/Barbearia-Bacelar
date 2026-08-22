"use client";

import { useEffect, useState } from "react";
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
import { listCatalogAction } from "@/features/catalog/actions";
import { createSubscriptionPlanAction, updateSubscriptionPlanAction } from "../actions";

type ExistingPlan = {
  id: string;
  name: string;
  priceMonthly: number;
  creditLimitPerMonth: number;
  services: { service: { id: string; name: string } }[];
};

export function PlanFormDialog({ plan }: { plan?: ExistingPlan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(plan?.name ?? "");
  const [priceMonthly, setPriceMonthly] = useState(String(plan?.priceMonthly ?? ""));
  const [creditLimitPerMonth, setCreditLimitPerMonth] = useState(String(plan?.creditLimitPerMonth ?? 4));
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    plan?.services.map((s) => s.service.id) ?? [],
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    listCatalogAction({ onlyActive: true }).then((sections) => {
      setServices(sections.flatMap((s) => s.services.map((sv) => ({ id: sv.id, name: sv.name }))));
    });
  }, [open]);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (!name.trim() || !priceMonthly) {
      toast.error("Nome e preço mensal são obrigatórios.");
      return;
    }
    setSubmitting(true);
    try {
      if (plan) {
        await updateSubscriptionPlanAction({
          planId: plan.id,
          name,
          priceMonthly: Number(priceMonthly),
          creditLimitPerMonth: Number(creditLimitPerMonth),
        });
        toast.success("Plano atualizado.");
      } else {
        if (selectedServiceIds.length === 0) {
          toast.error("Selecione ao menos um serviço incluso.");
          setSubmitting(false);
          return;
        }
        await createSubscriptionPlanAction({
          name,
          priceMonthly: Number(priceMonthly),
          creditLimitPerMonth: Number(creditLimitPerMonth),
          serviceIds: selectedServiceIds,
        });
        toast.success("Plano criado.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar plano.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {plan ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" /> Novo Plano
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan ? "Editar plano" : "Novo plano"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-name">Nome</Label>
            <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Plano Essencial" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="plan-price">Preço mensal (R$)</Label>
              <Input id="plan-price" type="number" value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-credits">Créditos por mês</Label>
              <Input
                id="plan-credits"
                type="number"
                value={creditLimitPerMonth}
                onChange={(e) => setCreditLimitPerMonth(e.target.value)}
              />
            </div>
          </div>
          {!plan && (
            <div className="space-y-2">
              <Label>Serviços inclusos</Label>
              <div className="flex flex-wrap gap-2">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      selectedServiceIds.includes(s.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
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
