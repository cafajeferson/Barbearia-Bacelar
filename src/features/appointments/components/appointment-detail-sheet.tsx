"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCircle2, Copy, Crown, Play, UserX, XCircle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/lib/format";
import { timeToMinutes } from "@/shared/lib/time";
import { cancelAppointmentAction, transitionAppointmentStatusAction } from "../actions";
import type { AppointmentStatus } from "@/generated/prisma/enums";

export type AppointmentDetail = {
  id: string;
  status: AppointmentStatus;
  startTime: string;
  endTime: string;
  totalPrice: number;
  notes: string | null;
  forceOverlap: boolean;
  client: { name: string; phone: string | null; subscriptions: unknown[] };
  serviceLines: { name: string; durationMinutes: number; price: number }[];
  products: { productId: string; quantity: number; priceAtBooking: number; product: { name: string } }[];
  couponRedemptions: { discountApplied: number; coupon: { code: string } }[];
};

const STATUS: Record<AppointmentStatus, { label: string; className: string }> = {
  SCHEDULED: { label: "Agendado", className: "border-blue-500/40 bg-blue-500/10 text-blue-400" },
  CONFIRMED: { label: "Confirmado", className: "border-blue-500/40 bg-blue-500/10 text-blue-400" },
  IN_PROGRESS: { label: "Em atendimento", className: "border-primary/40 bg-primary/10 text-primary" },
  COMPLETED: { label: "Concluído", className: "border-success/40 bg-success/10 text-success" },
  CANCELLED: { label: "Cancelado", className: "border-border bg-secondary text-muted-foreground" },
  NO_SHOW: { label: "Não compareceu", className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

/**
 * Painel lateral do agendamento — abre ao clicar num horário marcado na
 * Agenda Mestre (admin) ou na Minha Agenda (profissional). Mostra quem é,
 * o que vai fazer e quanto custa, e concentra as ações do atendimento:
 * iniciar, concluir, marcar falta e excluir.
 */
export function AppointmentDetailSheet({
  appointment,
  professionalName,
  dateISO,
  onClose,
}: {
  appointment: AppointmentDetail | null;
  professionalName: string;
  dateISO: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>, successMessage: string, closeAfter: boolean) {
    startTransition(async () => {
      try {
        await action();
        toast.success(successMessage);
        if (closeAfter) onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
      }
    });
  }

  function transition(toStatus: AppointmentStatus, message: string, closeAfter = false) {
    if (!appointment) return;
    run(() => transitionAppointmentStatusAction({ appointmentId: appointment.id, toStatus }), message, closeAfter);
  }

  function remove() {
    if (!appointment) return;
    // Concluído / falta: sai do fluxo normal, então o servidor exige um
    // motivo (fica no histórico do agendamento).
    const needsReason = appointment.status === "COMPLETED" || appointment.status === "NO_SHOW";
    let reason: string | undefined;
    if (needsReason) {
      const typed = window.prompt("Este atendimento já foi fechado. Informe o motivo para excluí-lo da agenda:");
      if (typed === null) return;
      if (!typed.trim()) {
        toast.error("Informe um motivo para excluir.");
        return;
      }
      reason = typed.trim();
    } else if (!window.confirm("Cancelar este agendamento e tirá-lo da agenda?")) {
      return;
    }
    run(() => cancelAppointmentAction({ appointmentId: appointment.id, reason }), "Agendamento cancelado.", true);
  }

  const a = appointment;
  const status = a ? STATUS[a.status] : null;
  const duration = a ? timeToMinutes(a.endTime) - timeToMinutes(a.startTime) : 0;
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short" }).format(
    new Date(`${dateISO}T12:00:00`),
  );
  const isSubscriber = !!a && a.client.subscriptions.length > 0;
  const productsTotal = a ? a.products.reduce((sum, p) => sum + p.quantity * p.priceAtBooking, 0) : 0;
  const isOpen = !!a && (a.status === "SCHEDULED" || a.status === "CONFIRMED" || a.status === "IN_PROGRESS");

  return (
    <Sheet open={!!a} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {a && status && (
          <>
            <div className="border-b p-5 pr-12">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <SheetTitle className="text-xl">{a.client.name}</SheetTitle>
                <Badge variant="outline" className={cn("shrink-0", status.className)}>
                  {status.label}
                </Badge>
              </div>
              <SheetDescription className="mt-1">
                {dateLabel} · {a.startTime}–{a.endTime} · {duration} min · com{" "}
                <span className="font-medium text-foreground">{professionalName}</span>
              </SheetDescription>
              {a.forceOverlap && (
                <Badge variant="destructive" className="mt-2">
                  Sobreposição forçada
                </Badge>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {a.client.phone && (
                <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
                  <a href={`tel:${a.client.phone.replace(/\D/g, "")}`} className="text-lg font-semibold hover:underline">
                    {a.client.phone}
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Copiar telefone"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(a.client.phone ?? "")
                        .then(() => toast.success("Telefone copiado."))
                        .catch(() => toast.error("Não foi possível copiar."));
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="border-b px-5 py-4">
                <p className="mb-2 text-xs text-muted-foreground">Serviços</p>
                <ul className="space-y-3">
                  {a.serviceLines.map((s, i) => (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.durationMinutes} min</p>
                      </div>
                      <p className="whitespace-nowrap font-semibold">{formatBRL(s.price)}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {a.products.length > 0 && (
                <div className="border-b px-5 py-4">
                  <p className="mb-2 text-xs text-muted-foreground">Produtos pedidos pelo cliente</p>
                  <ul className="space-y-1">
                    {a.products.map((p) => (
                      <li key={p.productId} className="flex items-center justify-between gap-3 text-sm">
                        <span>
                          {p.quantity}× {p.product.name}
                        </span>
                        <span className="whitespace-nowrap">{formatBRL(p.quantity * p.priceAtBooking)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Separar para retirada · {formatBRL(productsTotal)} a parte
                  </p>
                </div>
              )}

              <div className="border-b px-5 py-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Total</p>
                  <p className="text-lg font-semibold text-primary">{formatBRL(a.totalPrice)}</p>
                </div>
                {a.couponRedemptions.map((r, i) => (
                  <p key={i} className="mt-1 text-xs text-muted-foreground">
                    Cupom {r.coupon.code}: −{formatBRL(r.discountApplied)}
                  </p>
                ))}
                {a.totalPrice === 0 && isSubscriber ? (
                  <p className="mt-1 flex items-center gap-1 text-sm text-success">
                    <Check className="h-4 w-4" /> Pago · Plano de assinatura
                  </p>
                ) : (
                  a.status !== "COMPLETED" && <p className="mt-1 text-sm text-muted-foreground">Pagar no local</p>
                )}
              </div>

              {isSubscriber && (
                <p className="flex items-center gap-2 px-5 py-3 text-sm text-muted-foreground">
                  <Crown className="h-4 w-4 text-primary" /> Assinante
                </p>
              )}
              {a.notes && (
                <p className="border-t px-5 py-3 text-sm">
                  <span className="text-muted-foreground">Observação: </span>
                  {a.notes}
                </p>
              )}
            </div>

            <div className="space-y-3 border-t p-5">
              {(a.status === "SCHEDULED" || a.status === "CONFIRMED") && (
                <Button
                  className="h-12 w-full text-base"
                  disabled={isPending}
                  onClick={() => transition("IN_PROGRESS", "Atendimento iniciado.")}
                >
                  <Play className="mr-2 h-4 w-4" /> Iniciar atendimento
                </Button>
              )}
              {a.status === "IN_PROGRESS" && (
                <Button
                  className="h-12 w-full text-base"
                  disabled={isPending}
                  onClick={() => transition("COMPLETED", "Atendimento concluído.", true)}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Concluir atendimento
                </Button>
              )}
              {a.status === "SCHEDULED" && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isPending}
                  onClick={() => transition("CONFIRMED", "Agendamento confirmado.")}
                >
                  <Check className="mr-2 h-4 w-4" /> Confirmar presença
                </Button>
              )}
              <div className="flex items-center justify-end gap-1">
                {isOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={() => transition("NO_SHOW", "Marcado como falta.", true)}
                  >
                    <UserX className="mr-1 h-4 w-4" /> No-show
                  </Button>
                )}
                {a.status !== "CANCELLED" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={remove}
                  >
                    <XCircle className="mr-1 h-4 w-4" /> {isOpen ? "Cancelar" : "Excluir"}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
