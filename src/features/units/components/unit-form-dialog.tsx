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
import { createUnitAction, updateUnitAction } from "../actions";

type ExistingUnit = { id: string; name: string; address: string; phone: string | null; active: boolean };

export function UnitFormDialog({ unit }: { unit?: ExistingUnit }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(unit?.name ?? "");
  const [address, setAddress] = useState(unit?.address ?? "");
  const [phone, setPhone] = useState(unit?.phone ?? "");
  const [active, setActive] = useState(unit?.active ?? true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const input = { name, address, phone, active };
      if (unit) await updateUnitAction({ unitId: unit.id, ...input });
      else await createUnitAction(input);
      toast.success(unit ? "Unidade atualizada." : "Unidade criada.");
      setOpen(false);
      if (!unit) {
        setName("");
        setAddress("");
        setPhone("");
        setActive(true);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar a unidade.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {unit ? (
          <Button size="icon" variant="ghost" title="Editar unidade">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" /> Nova unidade
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{unit ? "Editar unidade" : "Nova unidade"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unit-name">Nome</Label>
            <Input id="unit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit-address">Endereço</Label>
            <Input id="unit-address" value={address} onChange={(e) => setAddress(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit-phone">Telefone (opcional)</Label>
            <Input id="unit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="unit-active">Unidade ativa</Label>
              <p className="text-xs text-muted-foreground">Desativada, some dos filtros e do agendamento.</p>
            </div>
            <Switch id="unit-active" checked={active} onCheckedChange={setActive} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
