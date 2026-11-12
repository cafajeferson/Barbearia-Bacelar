"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOwnProfessionalProfileAction } from "../actions";

/** Admin sem cadastro de colaborador: cria o cadastro de barbeiro na própria conta. */
export function OwnProfessionalButton({ defaultName, unitId }: { defaultName: string; unitId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [pending, startTransition] = useTransition();
  function save() {
    startTransition(async () => {
      try {
        await createOwnProfessionalProfileAction({ name: name.trim(), unitIds: [unitId] });
        toast.success("Pronto! Use \"Trocar para colaborador\" no menu para ver a sua agenda.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível criar o cadastro.");
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Scissors className="mr-2 h-4 w-4" /> Também atendo como barbeiro
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atender como barbeiro</DialogTitle>
          <DialogDescription>
            Cria o seu cadastro de colaborador nesta mesma conta. Você aparece na agenda, recebe agendamentos e troca
            para a sua Minha Agenda pelo botão no menu, sem sair do admin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="own-pro-name">Nome na agenda</Label>
          <Input id="own-pro-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending || name.trim().length < 2}>
            {pending ? "Criando..." : "Criar meu cadastro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
