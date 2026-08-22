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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createServiceAction, updateServiceAction } from "../actions";

type ExistingService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  genderTag: string | null;
  featured: boolean;
};

export function ServiceFormDialog({
  sectionId,
  service,
}: {
  sectionId: string;
  service?: ExistingService;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [durationMinutes, setDurationMinutes] = useState(String(service?.durationMinutes ?? 30));
  const [price, setPrice] = useState(String(service?.price ?? ""));
  const [genderTag, setGenderTag] = useState(service?.genderTag ?? "UNISSEX");
  const [featured, setFeatured] = useState(service?.featured ?? false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !price) {
      toast.error("Nome e preço são obrigatórios.");
      return;
    }
    setSubmitting(true);
    try {
      const genderValue = genderTag === "UNISSEX" ? undefined : genderTag;
      if (service) {
        await updateServiceAction({
          serviceId: service.id,
          name,
          description: description || undefined,
          durationMinutes: Number(durationMinutes),
          price: Number(price),
          genderTag: genderValue,
          featured,
        });
        toast.success("Serviço atualizado.");
      } else {
        await createServiceAction({
          sectionId,
          name,
          description: description || undefined,
          durationMinutes: Number(durationMinutes),
          price: Number(price),
          genderTag: genderValue,
          featured,
        });
        toast.success("Serviço criado.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar serviço.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {service ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus className="mr-1 h-4 w-4" /> Novo Serviço
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service-name">Nome</Label>
            <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-description">Descrição</Label>
            <Textarea id="service-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="service-duration">Duração (min)</Label>
              <Input id="service-duration" type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-price">Preço (R$)</Label>
              <Input id="service-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-gender">Gênero</Label>
              <Select value={genderTag} onValueChange={setGenderTag}>
                <SelectTrigger id="service-gender">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNISSEX">Unissex</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Feminino</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <p className="text-sm font-medium">Destaque</p>
            <Switch checked={featured} onCheckedChange={setFeatured} />
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
