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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { createClientAction, updateClientAction } from "../actions";

type ExistingClient = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  blocked: boolean;
};

export function ClientFormDialog({ client }: { client?: ExistingClient }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(client?.name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [blocked, setBlocked] = useState(client?.blocked ?? false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !phone.trim()) {
      toast.error("Nome e telefone são obrigatórios.");
      return;
    }
    setSubmitting(true);
    try {
      if (client) {
        await updateClientAction({
          clientId: client.id,
          name,
          phone,
          email: email || undefined,
          notes: notes || undefined,
          blocked,
        });
        toast.success("Cliente atualizado.");
      } else {
        await createClientAction({ name, phone, email: email || undefined, notes: notes || undefined });
        toast.success("Cliente criado.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar cliente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {client ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" /> Novo Cliente
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{client ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="client-name">Nome</Label>
              <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Telefone</Label>
              <Input id="client-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-email">E-mail</Label>
            <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-notes">Observações</Label>
            <Textarea id="client-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {client && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Bloqueado</p>
                <p className="text-xs text-muted-foreground">Impede novos agendamentos pelo app.</p>
              </div>
              <Switch checked={blocked} onCheckedChange={setBlocked} />
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
