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
import { createProfessionalAction, updateProfessionalAction } from "../actions";

type ExistingProfessional = {
  id: string;
  name: string;
  title: string | null;
  color: string;
  commissionServicePct: number | null;
};

export function ProfessionalFormDialog({
  professional,
  unitId,
}: {
  professional?: ExistingProfessional;
  unitId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(professional?.name ?? "");
  const [title, setTitle] = useState(professional?.title ?? "");
  const [color, setColor] = useState(professional?.color ?? "#F5B301");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [commissionServicePct, setCommissionServicePct] = useState(
    professional?.commissionServicePct != null ? String(professional.commissionServicePct) : "",
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Informe o nome.");
      return;
    }
    setSubmitting(true);
    try {
      if (professional) {
        await updateProfessionalAction({
          professionalId: professional.id,
          name,
          title: title || undefined,
          color,
          commissionServicePct: commissionServicePct ? Number(commissionServicePct) : null,
        });
        toast.success("Profissional atualizado.");
      } else {
        if (!email.trim() || !password.trim()) {
          toast.error("Informe e-mail e senha de acesso.");
          setSubmitting(false);
          return;
        }
        await createProfessionalAction({
          name,
          email,
          password,
          title: title || undefined,
          color,
          unitIds: [unitId],
          commissionServicePct: commissionServicePct ? Number(commissionServicePct) : undefined,
        });
        toast.success("Profissional adicionado.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar profissional.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {professional ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" /> Adicionar Profissional
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{professional ? "Editar profissional" : "Novo profissional"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="prof-name">Nome</Label>
              <Input id="prof-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prof-title">Título</Label>
              <Input id="prof-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Barbeiro" />
            </div>
          </div>

          {!professional && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="prof-email">E-mail de acesso</Label>
                <Input id="prof-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prof-password">Senha</Label>
                <Input id="prof-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="prof-color">Cor</Label>
              <Input id="prof-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 p-1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prof-commission">Comissão de serviço (%)</Label>
              <Input
                id="prof-commission"
                type="number"
                value={commissionServicePct}
                onChange={(e) => setCommissionServicePct(e.target.value)}
                placeholder="Padrão do sistema"
              />
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
