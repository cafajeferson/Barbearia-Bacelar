"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, LockOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { initials, formatBRL } from "@/shared/lib/format";
import { timeToMinutes, minutesToTime } from "@/shared/lib/time";
import { rescheduleAppointmentAction } from "../actions";
import { AppointmentDetailSheet } from "./appointment-detail-sheet";
import { NewAppointmentDialog } from "./new-appointment-dialog";
import type { getAgendaMestreData } from "../service";

type RawAgendaData = Awaited<ReturnType<typeof getAgendaMestreData>>;
type RawAppointment = RawAgendaData["appointments"][number];
// totalPrice/priceAtBooking vêm como Decimal do Prisma, que não atravessa a
// fronteira Server -> Client Component — a página converte pra number antes
// de passar.
export type AgendaData = Omit<RawAgendaData, "appointments"> & {
  appointments: (Omit<RawAppointment, "totalPrice" | "products" | "couponRedemptions"> & {
    totalPrice: number;
    serviceLines: { name: string; durationMinutes: number; price: number }[];
    products: (Omit<RawAppointment["products"][number], "priceAtBooking"> & { priceAtBooking: number })[];
    couponRedemptions: (Omit<RawAppointment["couponRedemptions"][number], "discountApplied" | "coupon"> & {
      discountApplied: number;
      coupon: Omit<RawAppointment["couponRedemptions"][number]["coupon"], "discountValue"> & {
        discountValue: number;
      };
    })[];
  })[];
};

const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const PX_PER_MINUTE = 1.4;
const SNAP_MINUTES = 5;
const MIN_DURATION = 10;

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isConflictMessage(err: unknown) {
  return err instanceof Error && err.message.includes("Conflito de horário");
}

function snap(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

type PendingChange = {
  appointmentId: string;
  clientName: string;
  fromProfessionalId: string;
  toProfessionalId: string;
  fromStart: string;
  fromEnd: string;
  toStart: string;
  toEnd: string;
} & ({ kind: "move"; professionalId: string; startTime: string } | { kind: "resize"; durationMinutes: number });

type PendingForce =
  | { kind: "move"; appointmentId: string; professionalId: string; startTime: string }
  | { kind: "resize"; appointmentId: string; durationMinutes: number };

export function CalendarBoard({
  data,
  unitId,
  dateISO,
  isToday,
  canForceOverlap = true,
}: {
  data: AgendaData;
  unitId: string;
  dateISO: string;
  isToday: boolean;
  /** Só ADMIN pode forçar sobreposição (regra do backend) — Minha Agenda do profissional esconde essa opção em vez de deixar o botão falhar. */
  canForceOverlap?: boolean;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pendingForce, setPendingForce] = useState<PendingForce | null>(null);
  // Cadeado: a agenda abre TRAVADA. Travada, rolar a tela por cima de um
  // cartão rola a página (não arrasta o cliente) e tocar só abre os detalhes;
  // para mover ou mudar a duração é preciso destravar antes. Depois de cada
  // mudança confirmada, trava de novo sozinha.
  const [locked, setLocked] = useState(true);
  // Mudança feita arrastando/esticando: só vale depois de confirmar no aviso.
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState("");
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createAt, setCreateAt] = useState<{ professionalId: string; startTime: string } | null>(null);
  // Preview local ao redimensionar — só grava no servidor no soltar, mas o card já reflete o tamanho em tempo real.
  const [resizePreview, setResizePreview] = useState<{ appointmentId: string; durationMinutes: number } | null>(null);
  const resizingRef = useRef<{ appointmentId: string; startY: number; baseDuration: number } | null>(null);
  // Preview local ao arrastar (mover) — mesma ideia do resize.
  const [movePreview, setMovePreview] = useState<{ appointmentId: string; professionalId: string; top: number } | null>(null);
  const lastMoveRef = useRef<{ professionalId: string; top: number } | null>(null);
  const lastResizeRef = useRef<number | null>(null);
  const movingRef = useRef<{
    appointmentId: string;
    startX: number;
    startY: number;
    grabOffsetY: number;
    originalProfessionalId: string;
    originalStartTime: string;
    moved: boolean;
  } | null>(null);

  const visibleProfessionals = data.professionals.filter((p) => !hidden.has(p.id));

  const appointmentsByProf = useMemo(() => {
    const map = new Map<string, AgendaData["appointments"]>();
    for (const a of data.appointments) {
      const list = map.get(a.professionalId) ?? [];
      list.push(a);
      map.set(a.professionalId, list);
    }
    return map;
  }, [data.appointments]);

  const blocksByProf = useMemo(() => {
    const map = new Map<string, AgendaData["blockedSlots"]>();
    for (const b of data.blockedSlots) {
      const list = map.get(b.professionalId) ?? [];
      list.push(b);
      map.set(b.professionalId, list);
    }
    return map;
  }, [data.blockedSlots]);

  function toggleProfessional(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doReschedule(input: {
    appointmentId: string;
    professionalId?: string;
    startTime?: string;
    durationMinutes?: number;
    force?: { reason: string };
  }) {
    await rescheduleAppointmentAction({
      appointmentId: input.appointmentId,
      professionalId: input.professionalId,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      forceOverlap: !!input.force,
      overrideReason: input.force?.reason,
    });
    toast.success(input.force ? "Sobreposição forçada com sucesso." : "Agendamento atualizado.");
    setPendingForce(null);
    setReason("");
    router.refresh();
  }

  // Pointer Events (não o Drag-and-Drop nativo do HTML5, que não funciona em
  // toque) — assim o profissional consegue arrastar pelo celular, não só
  // admin no desktop com mouse. Um toque parado (sem mover) abre os
  // detalhes; só vira "arrastar" depois de passar de um limiar de movimento.
  function startMove(e: React.PointerEvent, appointment: AgendaData["appointments"][number]) {
    if (e.button !== 0 || locked) return;
    const cardEl = e.currentTarget as HTMLElement;
    const columnEl = cardEl.closest<HTMLElement>("[data-professional-id]");
    if (!columnEl) return;
    const colRect = columnEl.getBoundingClientRect();
    const cardTop = (timeToMinutes(appointment.startTime) - DAY_START) * PX_PER_MINUTE;
    const grabOffsetY = e.clientY - colRect.top - cardTop;
    movingRef.current = {
      appointmentId: appointment.id,
      startX: e.clientX,
      startY: e.clientY,
      grabOffsetY,
      originalProfessionalId: appointment.professionalId,
      originalStartTime: appointment.startTime,
      moved: false,
    };

    function onMove(ev: PointerEvent) {
      const ctx = movingRef.current;
      if (!ctx) return;
      const dx = ev.clientX - ctx.startX;
      const dy = ev.clientY - ctx.startY;
      if (!ctx.moved && Math.hypot(dx, dy) < 6) return;
      ctx.moved = true;
      const targetEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-professional-id]");
      const targetProfessionalId = targetEl?.dataset.professionalId ?? ctx.originalProfessionalId;
      const targetRect = (targetEl ?? columnEl)!.getBoundingClientRect();
      const top = Math.max(0, ev.clientY - targetRect.top - ctx.grabOffsetY);
      setDragOverCol(targetProfessionalId);
      lastMoveRef.current = { professionalId: targetProfessionalId, top };
      setMovePreview({ appointmentId: ctx.appointmentId, professionalId: targetProfessionalId, top });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const ctx = movingRef.current;
      movingRef.current = null;
      setDragOverCol(null);
      if (!ctx) return;
      if (!ctx.moved) {
        // Só um toque, sem arrastar de verdade — abre os detalhes.
        setSelectedId(ctx.appointmentId);
        setMovePreview(null);
        return;
      }
      const preview = lastMoveRef.current;
      lastMoveRef.current = null;
      const appt = data.appointments.find((x) => x.id === ctx.appointmentId);
      if (!preview || !appt) {
        setMovePreview(null);
        return;
      }
      const minutes = snap(DAY_START + preview.top / PX_PER_MINUTE);
      const startTime = minutesToTime(minutes);
      if (startTime === ctx.originalStartTime && preview.professionalId === ctx.originalProfessionalId) {
        setMovePreview(null);
        return;
      }
      const duration = timeToMinutes(appt.endTime) - timeToMinutes(appt.startTime);
      // Não salva ainda: mostra o aviso com o antes/depois e espera confirmar.
      // O cartão fica na posição nova (encaixada) enquanto o aviso está aberto.
      setMovePreview({ appointmentId: ctx.appointmentId, professionalId: preview.professionalId, top: (minutes - DAY_START) * PX_PER_MINUTE });
      setPendingChange({
        kind: "move",
        appointmentId: ctx.appointmentId,
        clientName: appt.client.name,
        fromProfessionalId: ctx.originalProfessionalId,
        toProfessionalId: preview.professionalId,
        fromStart: appt.startTime,
        fromEnd: appt.endTime,
        toStart: startTime,
        toEnd: minutesToTime(minutes + duration),
        professionalId: preview.professionalId,
        startTime,
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, professionalId: string) {
    // Só cria se o clique foi direto no fundo da coluna (não borbulhou de um
    // card/bloqueio, que já tem seu próprio handler com stopPropagation).
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutes = snap(DAY_START + offsetY / PX_PER_MINUTE);
    setCreateAt({ professionalId, startTime: minutesToTime(minutes) });
  }

  function startResize(e: React.PointerEvent, appointmentId: string, baseDuration: number) {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    resizingRef.current = { appointmentId, startY: e.clientY, baseDuration };
    setResizePreview({ appointmentId, durationMinutes: baseDuration });

    function onMove(ev: PointerEvent) {
      const ctx = resizingRef.current;
      if (!ctx) return;
      const deltaMinutes = (ev.clientY - ctx.startY) / PX_PER_MINUTE;
      const duration = Math.max(MIN_DURATION, snap(ctx.baseDuration + deltaMinutes));
      lastResizeRef.current = duration;
      setResizePreview({ appointmentId: ctx.appointmentId, durationMinutes: duration });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const ctx = resizingRef.current;
      resizingRef.current = null;
      if (!ctx) return;
      const duration = lastResizeRef.current;
      lastResizeRef.current = null;
      const appt = data.appointments.find((x) => x.id === ctx.appointmentId);
      if (duration === null || duration === ctx.baseDuration || !appt) {
        setResizePreview(null);
        return;
      }
      setPendingChange({
        kind: "resize",
        appointmentId: ctx.appointmentId,
        clientName: appt.client.name,
        fromProfessionalId: appt.professionalId,
        toProfessionalId: appt.professionalId,
        fromStart: appt.startTime,
        fromEnd: appt.endTime,
        toStart: appt.startTime,
        toEnd: minutesToTime(timeToMinutes(appt.startTime) + duration),
        durationMinutes: duration,
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function clearPreviews() {
    setMovePreview(null);
    setResizePreview(null);
  }

  function cancelPendingChange() {
    setPendingChange(null);
    clearPreviews();
  }

  function confirmPendingChange() {
    const change = pendingChange;
    if (!change) return;
    setPendingChange(null);
    const input =
      change.kind === "move"
        ? { appointmentId: change.appointmentId, professionalId: change.professionalId, startTime: change.startTime }
        : { appointmentId: change.appointmentId, durationMinutes: change.durationMinutes };
    doReschedule(input)
      .then(() => {
        clearPreviews();
        setLocked(true);
      })
      .catch((err) => {
        if (isConflictMessage(err) && canForceOverlap) {
          setPendingForce(
            change.kind === "move"
              ? { kind: "move", appointmentId: change.appointmentId, professionalId: change.professionalId, startTime: change.startTime }
              : { kind: "resize", appointmentId: change.appointmentId, durationMinutes: change.durationMinutes },
          );
        } else {
          toast.error(err instanceof Error ? err.message : "Não foi possível mudar o agendamento.");
          clearPreviews();
        }
      });
  }

  function handleForceConfirm() {
    if (!pendingForce || !reason.trim()) return;
    const promise =
      pendingForce.kind === "move"
        ? doReschedule({
            appointmentId: pendingForce.appointmentId,
            professionalId: pendingForce.professionalId,
            startTime: pendingForce.startTime,
            force: { reason },
          })
        : doReschedule({
            appointmentId: pendingForce.appointmentId,
            durationMinutes: pendingForce.durationMinutes,
            force: { reason },
          });
    promise
      .then(() => setLocked(true))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Erro ao forçar sobreposição."))
      .finally(clearPreviews);
  }

  const selected = selectedId ? data.appointments.find((a) => a.id === selectedId) : null;

  const totalHeight = (DAY_END - DAY_START) * PX_PER_MINUTE;
  const hourMarks = Array.from(
    { length: Math.ceil((DAY_END - DAY_START) / 60) + 1 },
    (_, i) => DAY_START + i * 60,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">EQUIPE</span>
        {data.professionals.map((p) => (
          <button
            key={p.id}
            onClick={() => toggleProfessional(p.id)}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors"
            style={{
              borderColor: p.color,
              backgroundColor: hidden.has(p.id) ? "transparent" : `${p.color}22`,
              opacity: hidden.has(p.id) ? 0.5 : 1,
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name.split(" ")[0]}
          </button>
        ))}
        <button className="text-xs text-muted-foreground underline" onClick={() => setHidden(new Set())}>
          Todos
        </button>
        <button
          className="text-xs text-muted-foreground underline"
          onClick={() => setHidden(new Set(data.professionals.map((p) => p.id)))}
        >
          Nenhum
        </button>
        <button
          type="button"
          onClick={() => setLocked((v) => !v)}
          aria-pressed={!locked}
          title={locked ? "Destravar para mover ou mudar a duração dos agendamentos" : "Travar a agenda"}
          className={`ml-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            locked
              ? "border-border text-muted-foreground hover:bg-accent"
              : "border-warning bg-warning/15 text-warning"
          }`}
        >
          {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          {locked ? "Agenda travada" : "Edição liberada — toque para travar"}
        </button>
      </div>

      <div className="flex overflow-x-auto rounded-lg border">
        <div className="w-14 shrink-0 border-r">
          <div className="h-12 border-b" />
          <div className="relative" style={{ height: totalHeight }}>
            {hourMarks.map((m) => (
              <div
                key={m}
                className="absolute inset-x-0 -translate-y-1/2 pr-2 text-right text-xs text-muted-foreground"
                style={{ top: (m - DAY_START) * PX_PER_MINUTE }}
              >
                {String(Math.floor(m / 60)).padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>

        {visibleProfessionals.map((prof) => (
          <div key={prof.id} className="w-56 shrink-0 border-r last:border-r-0">
            <div className="flex h-12 items-center gap-2 border-b px-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: prof.color }}
              >
                {initials(prof.name)}
              </div>
              <span className="min-w-0 truncate text-sm font-medium">{prof.name}</span>
            </div>
            <div
              className="relative cursor-pointer"
              data-professional-id={prof.id}
              style={{ height: totalHeight }}
              onClick={(e) => handleColumnClick(e, prof.id)}
            >
              {hourMarks.map((m) => (
                <div
                  key={m}
                  className="absolute w-full border-t border-border/60"
                  style={{ top: (m - DAY_START) * PX_PER_MINUTE }}
                />
              ))}

              {dragOverCol === prof.id && (
                <div className="pointer-events-none absolute inset-0 bg-primary/5" />
              )}

              {isToday && minutesNow() >= DAY_START && minutesNow() <= DAY_END && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-destructive"
                  style={{ top: (minutesNow() - DAY_START) * PX_PER_MINUTE }}
                />
              )}

              {(blocksByProf.get(prof.id) ?? []).map((b) => {
                const top = (timeToMinutes(b.startTime) - DAY_START) * PX_PER_MINUTE;
                const height = (timeToMinutes(b.endTime) - timeToMinutes(b.startTime)) * PX_PER_MINUTE;
                return (
                  <div
                    key={b.id}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-x-0 z-10 overflow-hidden border-y border-destructive/20 bg-[repeating-linear-gradient(45deg,theme(colors.destructive/12%),theme(colors.destructive/12%)_6px,transparent_6px,transparent_12px)] p-1 text-[11px] text-muted-foreground"
                    style={{ top, height: Math.max(height, 16) }}
                    title={b.reason ?? "Bloqueado"}
                  >
                    {b.reason ?? "Bloqueado"}
                  </div>
                );
              })}

              {(appointmentsByProf.get(prof.id) ?? []).map((a) => {
                const isResizing = resizePreview?.appointmentId === a.id;
                const isMoving = movePreview?.appointmentId === a.id;
                const durationMinutes = isResizing
                  ? resizePreview.durationMinutes
                  : timeToMinutes(a.endTime) - timeToMinutes(a.startTime);
                const top =
                  movePreview?.appointmentId === a.id
                    ? movePreview.top
                    : (timeToMinutes(a.startTime) - DAY_START) * PX_PER_MINUTE;
                const cardHeight = Math.max(durationMinutes * PX_PER_MINUTE, 20);
                const faded = a.status === "COMPLETED" || a.status === "NO_SHOW";
                const inProgress = a.status === "IN_PROGRESS";
                const isSubscriber = a.client.subscriptions.length > 0;
                const redemption = a.couponRedemptions[0];
                const hasProducts = a.products.length > 0;
                return (
                  <div
                    key={a.id}
                    onPointerDown={(e) => startMove(e, a)}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Travada: o clique é só "abrir detalhes" (destravada isso é
                      // feito no soltar do arrastar, em startMove).
                      if (locked) setSelectedId(a.id);
                    }}
                    className={`group absolute left-0.5 right-0.5 z-10 rounded-md border p-1 text-[11px] leading-tight ${
                      locked ? "cursor-pointer" : "cursor-grab touch-none active:cursor-grabbing"
                    } ${inProgress ? "ring-2 ring-offset-1 ring-offset-background" : ""} ${isMoving ? "opacity-70 shadow-lg" : ""}`}
                    style={{
                      top,
                      height: cardHeight,
                      backgroundColor: `${prof.color}${faded ? "1a" : inProgress ? "4d" : "33"}`,
                      borderColor: a.status === "NO_SHOW" ? "oklch(var(--destructive))" : prof.color,
                      ...(inProgress ? ({ "--tw-ring-color": prof.color } as React.CSSProperties) : {}),
                    }}
                    title={`${a.client.name} — ${a.services.map((s) => s.service.name).join(" + ")}`}
                  >
                    {/* Cupom fica FORA do overflow-hidden de propósito — precisa se
                        destacar saindo um pouco do quadrado. Coroa (inline, antes do
                        nome) e sacola de produto (canto inferior) ficam dentro, sem sair do card. */}
                    {redemption && (
                      <span
                        className="pointer-events-none absolute -left-1.5 -top-2.5 z-20 flex select-none items-center gap-0.5 whitespace-nowrap rounded-full bg-background px-1 text-[10px] font-bold leading-none shadow drop-shadow"
                        style={{ color: prof.color }}
                        title={`Cupom ${redemption.coupon.code}`}
                      >
                        <span className="text-sm">🎟️</span>
                        {redemption.coupon.discountType === "PERCENT"
                          ? `${redemption.coupon.discountValue}%`
                          : formatBRL(redemption.coupon.discountValue)}
                      </span>
                    )}
                    {hasProducts && (
                      <span
                        className="pointer-events-none absolute bottom-0.5 right-1 z-20 select-none text-sm leading-none drop-shadow"
                        title={`Cliente pediu: ${a.products.map((p) => `${p.quantity}× ${p.product.name}`).join(", ")}`}
                      >
                        🛍️
                      </span>
                    )}
                    <div className={`h-full w-full overflow-hidden ${redemption ? "pt-1.5" : ""}`}>
                      <p className={`flex min-w-0 items-center gap-1 font-medium ${inProgress ? "uppercase" : ""}`}>
                        {isSubscriber && (
                          <span className="shrink-0 leading-none" title="Cliente assinante">
                            👑
                          </span>
                        )}
                        <span className="min-w-0 truncate">{a.client.name}</span>
                        {a.forceOverlap && <span className="shrink-0">⚠</span>}
                      </p>
                      <p className="truncate text-muted-foreground">
                        {a.services.map((s) => s.service.name).join(" + ")}
                      </p>
                      {cardHeight >= 44 && (
                        <p className="text-muted-foreground">
                          {a.startTime}–{minutesToTime(timeToMinutes(a.startTime) + durationMinutes)}
                        </p>
                      )}
                    </div>
                    {/* Alça de redimensionar — só na borda inferior, estilo Booksy. Sempre
                        visível (não só no hover): em toque não existe hover, e a alça
                        escondida ficava impossível de pegar com o dedo. */}
                    {!locked && (
                      <div
                        onPointerDown={(e) =>
                          startResize(e, a.id, timeToMinutes(a.endTime) - timeToMinutes(a.startTime))
                        }
                        className="absolute inset-x-0 bottom-0 flex h-4 touch-none cursor-ns-resize items-end justify-center pb-0.5"
                      >
                        <div className="h-1 w-8 rounded-full bg-foreground/40" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Diálogo de criação disparado ao clicar num espaço vazio da grade — mesmo diálogo do botão "Novo Agendamento", só que controlado e pré-preenchido. */}
      <NewAppointmentDialog
        professionals={data.professionals}
        defaultDate={dateISO}
        unitId={unitId}
        hideTrigger
        open={!!createAt}
        onOpenChange={(open) => !open && setCreateAt(null)}
        initialProfessionalId={createAt?.professionalId}
        initialStartTime={createAt?.startTime}
      />

      <AppointmentDetailSheet
        appointment={selected ?? null}
        professionalName={
          selected ? (data.professionals.find((p) => p.id === selected.professionalId)?.name ?? "") : ""
        }
        dateISO={dateISO}
        onClose={() => setSelectedId(null)}
      />

      <Dialog open={!!pendingChange} onOpenChange={(open) => !open && cancelPendingChange()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar mudança</DialogTitle>
          </DialogHeader>
          {pendingChange && (
            <div className="space-y-3">
              <p className="text-sm">
                Agendamento de <span className="font-semibold">{pendingChange.clientName}</span>
              </p>
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-lg border p-3 text-sm">
                <span className="text-xs uppercase text-muted-foreground">Antes</span>
                <span className="text-muted-foreground line-through">
                  {pendingChange.fromStart}–{pendingChange.fromEnd} ·{" "}
                  {data.professionals.find((p) => p.id === pendingChange.fromProfessionalId)?.name}
                </span>
                <span className="text-xs uppercase text-primary">Depois</span>
                <span className="font-semibold text-primary">
                  {pendingChange.toStart}–{pendingChange.toEnd} ·{" "}
                  {data.professionals.find((p) => p.id === pendingChange.toProfessionalId)?.name}
                </span>
              </div>
              {pendingChange.fromProfessionalId !== pendingChange.toProfessionalId && (
                <p className="text-xs text-warning">Atenção: o atendimento muda de profissional.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={cancelPendingChange}>
              Cancelar
            </Button>
            <Button onClick={confirmPendingChange}>Confirmar mudança</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingForce} onOpenChange={(open) => !open && (setPendingForce(null), clearPreviews())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Horário em conflito</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Já existe um agendamento (ou bloqueio) nesse horário para este profissional. Só admin
            pode forçar a sobreposição — informe o motivo para continuar.
          </p>
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: cliente chegou sem avisar, encaixe urgente."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingForce(null);
                clearPreviews();
              }}
            >
              Cancelar
            </Button>
            <Button disabled={!reason.trim()} onClick={handleForceConfirm}>
              Forçar sobreposição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
