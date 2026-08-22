"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listClientsAction, createClientAction } from "@/features/clients/actions";
import { listCatalogAction } from "@/features/catalog/actions";
import { createAppointmentAction } from "../actions";

type Professional = { id: string; name: string; color: string };

export function NewAppointmentDialog({
  professionals,
  defaultDate,
  unitId,
  triggerLabel = "Novo Agendamento",
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  initialProfessionalId,
  initialStartTime,
  hideTrigger = false,
}: {
  professionals: Professional[];
  defaultDate: string; // yyyy-mm-dd
  unitId: string;
  /** "Novo Agendamento" na Agenda Mestre do admin, "Agendar horário" em Minha Agenda. */
  triggerLabel?: string;
  /** Modo controlado — usado pela Agenda Mestre pra abrir já preenchido ao clicar num espaço vazio da grade. Sem isso, o diálogo controla o próprio estado via o botão de disparo. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialProfessionalId?: string;
  initialStartTime?: string;
  /** Esconde o botão padrão — pro caso controlado, onde quem abre é a grade, não um botão aqui dentro. */
  hideTrigger?: boolean;
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = setControlledOpen ?? setUncontrolledOpen;
  const [clients, setClients] = useState<Awaited<ReturnType<typeof listClientsAction>>>([]);
  const [services, setServices] = useState<{ id: string; name: string; price: number }[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [professionalId, setProfessionalId] = useState(initialProfessionalId ?? "");
  const [serviceId, setServiceId] = useState("");
  const [startTime, setStartTime] = useState(initialStartTime ?? "09:00");
  const [source, setSource] = useState<"ADMIN_MANUAL" | "WALK_IN">("ADMIN_MANUAL");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    listClientsAction({}).then(setClients);
    listCatalogAction({ onlyActive: true }).then((sections) => {
      setServices(
        sections.flatMap((s) =>
          s.services.map((sv) => ({ id: sv.id, name: sv.name, price: Number(sv.price) })),
        ),
      );
    });
    // Sincroniza com o clique na grade — só quando abre, pra não sobrescrever o que o usuário já ajustou no formulário.
    if (initialProfessionalId) setProfessionalId(initialProfessionalId);
    if (initialStartTime) setStartTime(initialStartTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      let finalClientId = clientId;
      if (mode === "new") {
        if (!newClientName.trim() || !newClientPhone.trim()) {
          toast.error("Informe nome e telefone do cliente.");
          setSubmitting(false);
          return;
        }
        // isWalkIn é sobre COMO o cadastro do cliente nasceu (aqui, direto
        // no modal, sem passar por /clientes) — independente da Origem do
        // agendamento (que pode ser "Agendado" mesmo pra um cliente novo).
        const created = await createClientAction({
          name: newClientName,
          phone: newClientPhone,
          isWalkIn: true,
        });
        finalClientId = created.id;
      }
      if (!finalClientId || !professionalId || !serviceId) {
        toast.error("Preencha cliente, profissional e serviço.");
        setSubmitting(false);
        return;
      }

      await createAppointmentAction({
        unitId,
        professionalId,
        clientId: finalClientId,
        serviceIds: [serviceId],
        scheduledDate: defaultDate,
        startTime,
        source,
      });
      toast.success("Agendamento criado.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar agendamento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-1 h-4 w-4" /> {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Agendamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2 text-sm">
            <button
              className={mode === "existing" ? "font-medium text-primary" : "text-muted-foreground"}
              onClick={() => setMode("existing")}
            >
              Cliente existente
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              className={mode === "new" ? "font-medium text-primary" : "text-muted-foreground"}
              onClick={() => setMode("new")}
            >
              Walk-in / novo cliente
            </button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <Label htmlFor="appt-client">Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="appt-client">
                  <SelectValue placeholder="Selecione um cliente" />
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
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="appt-new-client-name">Nome</Label>
                <Input id="appt-new-client-name" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appt-new-client-phone">Telefone</Label>
                <Input id="appt-new-client-phone" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="appt-professional">Profissional</Label>
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger id="appt-professional">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {professionals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appt-service">Serviço</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger id="appt-service">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="appt-time">Horário</Label>
              <Input id="appt-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-source">Origem</Label>
              <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
                <SelectTrigger id="appt-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN_MANUAL">Agendado</SelectItem>
                  <SelectItem value="WALK_IN">Walk-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Criando..." : "Criar agendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
