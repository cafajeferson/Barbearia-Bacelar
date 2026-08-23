"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { initials, formatBRL } from "@/shared/lib/format";
import { timeToMinutes, minutesToTime } from "@/shared/lib/time";
import { rescheduleAppointmentAction, cancelAppointmentAction } from "../actions";
import { AppointmentStatusActions } from "@/features/professionals/components/appointment-status-actions";
import { NewAppointmentDialog } from "./new-appointment-dialog";
import type { getAgendaMestreData } from "../service";
import type { AppointmentStatus } from "@/generated/prisma/enums";

type RawAgendaData = Awaited<ReturnType<typeof getAgendaMestreData>>;
// totalPrice vem como Decimal do Prisma, que não atravessa a fronteira
// Server -> Client Component — a página converte pra number antes de passar.
export type AgendaData = Omit<RawAgendaData, "appointments"> & {
  appointments: (Omit<RawAgendaData["appointments"][number], "totalPrice"> & { totalPrice: number })[];
};

const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const PX_PER_MINUTE = 1.4;
const SNAP_MINUTES = 5;
const MIN_DURATION = 10;

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

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

type PendingForce =
  | { kind: "move"; appointmentId: string; professionalId: string; startTime: string }
  | { kind: "resize"; appointmentId: string; durationMinutes: number };

export function CalendarBoard({
  data,
  unitId,
  dateISO,
  isToday,
}: {
  data: AgendaData;
  unitId: string;
  dateISO: string;
  isToday: boolean;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pendingForce, setPendingForce] = useState<PendingForce | null>(null);
  const [reason, setReason] = useState("");
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createAt, setCreateAt] = useState<{ professionalId: string; startTime: string } | null>(null);
  // Preview local ao redimensionar — só grava no servidor no mouseup, mas o card já reflete o tamanho em tempo real.
  const [resizePreview, setResizePreview] = useState<{ appointmentId: string; durationMinutes: number } | null>(null);
  const resizingRef = useRef<{ appointmentId: string; startY: number; baseDuration: number } | null>(null);

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

  function handleDrop(e: React.DragEvent<HTMLDivElement>, professionalId: string) {
    e.preventDefault();
    setDragOverCol(null);
    const appointmentId = e.dataTransfer.getData("appointmentId");
    if (!appointmentId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutes = snap(DAY_START + offsetY / PX_PER_MINUTE);
    const startTime = minutesToTime(minutes);
    doReschedule({ appointmentId, professionalId, startTime }).catch((err) => {
      if (isConflictMessage(err)) {
        setPendingForce({ kind: "move", appointmentId, professionalId, startTime });
      } else {
        toast.error(err instanceof Error ? err.message : "Erro ao reagendar.");
      }
    });
  }

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, professionalId: string) {
    // Só cria se o clique foi direto no fundo da coluna (não borbulhou de um
    // card/bloqueio, que já tem seu próprio handler com stopPropagation).
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutes = snap(DAY_START + offsetY / PX_PER_MINUTE);
    setCreateAt({ professionalId, startTime: minutesToTime(minutes) });
  }

  function startResize(e: React.MouseEvent, appointmentId: string, baseDuration: number) {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { appointmentId, startY: e.clientY, baseDuration };
    setResizePreview({ appointmentId, durationMinutes: baseDuration });

    function onMove(ev: MouseEvent) {
      const ctx = resizingRef.current;
      if (!ctx) return;
      const deltaMinutes = (ev.clientY - ctx.startY) / PX_PER_MINUTE;
      const duration = Math.max(MIN_DURATION, snap(ctx.baseDuration + deltaMinutes));
      setResizePreview({ appointmentId: ctx.appointmentId, durationMinutes: duration });
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const ctx = resizingRef.current;
      resizingRef.current = null;
      if (!ctx) return;
      setResizePreview((preview) => {
        if (preview && preview.durationMinutes !== ctx.baseDuration) {
          doReschedule({ appointmentId: ctx.appointmentId, durationMinutes: preview.durationMinutes }).catch(
            (err) => {
              if (isConflictMessage(err)) {
                setPendingForce({
                  kind: "resize",
                  appointmentId: ctx.appointmentId,
                  durationMinutes: preview.durationMinutes,
                });
              } else {
                toast.error(err instanceof Error ? err.message : "Erro ao redimensionar.");
              }
              setResizePreview(null);
            },
          );
        }
        return null;
      });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
      .catch((err) => toast.error(err instanceof Error ? err.message : "Erro ao forçar sobreposição."))
      .finally(() => setResizePreview(null));
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
              style={{ height: totalHeight }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(prof.id);
              }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, prof.id)}
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
                const durationMinutes = isResizing
                  ? resizePreview.durationMinutes
                  : timeToMinutes(a.endTime) - timeToMinutes(a.startTime);
                const top = (timeToMinutes(a.startTime) - DAY_START) * PX_PER_MINUTE;
                const cardHeight = Math.max(durationMinutes * PX_PER_MINUTE, 20);
                const faded = a.status === "COMPLETED" || a.status === "NO_SHOW";
                const inProgress = a.status === "IN_PROGRESS";
                const isSubscriber = a.client.subscriptions.length > 0;
                return (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("appointmentId", a.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(a.id);
                    }}
                    className={`group absolute left-0.5 right-0.5 z-10 cursor-grab overflow-hidden rounded-md border p-1 text-[11px] leading-tight active:cursor-grabbing ${inProgress ? "ring-2 ring-offset-1 ring-offset-background" : ""}`}
                    style={{
                      top,
                      height: cardHeight,
                      backgroundColor: `${prof.color}${faded ? "1a" : inProgress ? "4d" : "33"}`,
                      borderColor: a.status === "NO_SHOW" ? "oklch(var(--destructive))" : prof.color,
                      ...(inProgress ? ({ "--tw-ring-color": prof.color } as React.CSSProperties) : {}),
                    }}
                    title={`${a.client.name} — ${a.services.map((s) => s.service.name).join(" + ")}`}
                  >
                    <p className={`flex min-w-0 items-center gap-1 font-medium ${inProgress ? "uppercase" : ""}`}>
                      {isSubscriber && <Crown className="h-3 w-3 shrink-0" style={{ color: prof.color }} />}
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
                    {/* Alça de redimensionar — só na borda inferior, estilo Booksy. */}
                    <div
                      onMouseDown={(e) => startResize(e, a.id, timeToMinutes(a.endTime) - timeToMinutes(a.startTime))}
                      className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
                    >
                      <div className="mx-auto mt-1 h-0.5 w-6 rounded-full bg-foreground/40" />
                    </div>
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

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selected && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selected.client.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {selected.services.map((s) => s.service.name).join(" + ")}
              </p>
              <p>
                {selected.startTime}–{selected.endTime} · {formatBRL(selected.totalPrice)}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant={selected.status === "COMPLETED" ? "default" : "outline"}>
                  {STATUS_LABEL[selected.status]}
                </Badge>
                {selected.forceOverlap && <Badge variant="destructive">Sobreposição forçada</Badge>}
              </div>
            </div>
            <DialogFooter className="sm:justify-between">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  cancelAppointmentAction({ appointmentId: selected.id })
                    .then(() => {
                      toast.success("Agendamento cancelado.");
                      setSelectedId(null);
                      router.refresh();
                    })
                    .catch((err) => toast.error(err instanceof Error ? err.message : "Erro ao cancelar."));
                }}
              >
                Cancelar agendamento
              </Button>
              <AppointmentStatusActions appointmentId={selected.id} status={selected.status} />
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!pendingForce} onOpenChange={(open) => !open && (setPendingForce(null), setResizePreview(null))}>
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
                setResizePreview(null);
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
