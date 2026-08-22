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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listClientsAction } from "@/features/clients/actions";
import { listSubscriptionPlansAction, requestClientSubscriptionAction } from "../actions";

export function NewSubscriptionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Awaited<ReturnType<typeof listClientsAction>>>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof listSubscriptionPlansAction>>>([]);
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    listClientsAction({}).then(setClients);
    listSubscriptionPlansAction().then(setPlans);
  }, [open]);

  async function handleSubmit() {
    if (!clientId || !planId) {
      toast.error("Selecione cliente e plano.");
      return;
    }
    setSubmitting(true);
    try {
      await requestClientSubscriptionAction({ clientId, planId });
      toast.success("Solicitação de assinatura criada (pendente de aprovação).");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar assinatura.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" /> Nova Assinatura
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova assinatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-sub-client">Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="new-sub-client">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-sub-plan">Plano</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="new-sub-plan">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Criando..." : "Criar (pendente)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
