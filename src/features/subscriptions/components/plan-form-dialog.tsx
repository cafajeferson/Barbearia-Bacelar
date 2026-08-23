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
import { Textarea } from "@/components/ui/textarea";
import { listCatalogAction } from "@/features/catalog/actions";
import { createSubscriptionPlanAction, updateSubscriptionPlanAction } from "../actions";

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

type ExistingPlan = {
  id: string;
  name: string;
  description?: string | null;
  priceMonthly: number;
  creditLimitPerMonth: number;
  allowedWeekdays?: number[];
  services: { service: { id: string; name: string } }[];
};

export function PlanFormDialog({ plan }: { plan?: ExistingPlan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [priceMonthly, setPriceMonthly] = useState(String(plan?.priceMonthly ?? ""));
  const [creditLimitPerMonth, setCreditLimitPerMonth] = useState(String(plan?.creditLimitPerMonth ?? 4));
  const [allowedWeekdays, setAllowedWeekdays] = useState<number[]>(plan?.allowedWeekdays ?? []);
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

  function toggleWeekday(value: number) {
    setAllowedWeekdays((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  }

  async function handleSubmit() {
    if (!name.trim() || !priceMonthly) {
      toast.error("Nome e preço mensal são obrigatórios.");
      return;
    }
    if (selectedServiceIds.length === 0) {
      toast.error("Selecione ao menos um serviço incluso.");
      return;
    }
    setSubmitting(true);
    try {
      if (plan) {
        await updateSubscriptionPlanAction({
          planId: plan.id,
          name,
          description: description || undefined,
          priceMonthly: Number(priceMonthly),
          creditLimitPerMonth: Number(creditLimitPerMonth),
          allowedWeekdays,
          serviceIds: selectedServiceIds,
        });
        toast.success("Plano atualizado.");
      } else {
        await createSubscriptionPlanAction({
          name,
          description: description || undefined,
          priceMonthly: Number(priceMonthly),
          creditLimitPerMonth: Number(creditLimitPerMonth),
          allowedWeekdays,
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
          <div className="space-y-2">
            <Label htmlFor="plan-description">Descrição</Label>
            <Textarea
              id="plan-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: válido com qualquer barbeiro, exceto às segundas."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="plan-price">Preço mensal (R$)</Label>
              <Input id="plan-price" type="number" value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-credits">Vezes por período</Label>
              <Input
                id="plan-credits"
                type="number"
                value={creditLimitPerMonth}
                onChange={(e) => setCreditLimitPerMonth(e.target.value)}
              />
            </div>
          </div>
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
          <div className="space-y-2">
            <Label>Dias válidos (vazio = todos os dias)</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => toggleWeekday(w.value)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    allowedWeekdays.includes(w.value)
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
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
