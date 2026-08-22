"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { initials } from "@/shared/lib/format";
import { timeToMinutes } from "@/shared/lib/time";
import { rescheduleAppointmentAction } from "../actions";
import type { getAgendaMestreData } from "../service";

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

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isConflictMessage(err: unknown) {
  return err instanceof Error && err.message.includes("Conflito de horário");
}

export function AgendaGrid({ data, isToday }: { data: AgendaData; isToday: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pendingForce, setPendingForce] = useState<{
    appointmentId: string;
    professionalId: string;
    startTime: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

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

  async function doReschedule(
    appointmentId: string,
    professionalId: string,
    startTime: string,
    force?: { reason: string },
  ) {
    try {
      await rescheduleAppointmentAction({
        appointmentId,
        professionalId,
        startTime,
        forceOverlap: !!force,
        overrideReason: force?.reason,
      });
      toast.success(force ? "Sobreposição forçada com sucesso." : "Agendamento reagendado.");
      setPendingForce(null);
      setReason("");
      router.refresh();
    } catch (err) {
      if (!force && isConflictMessage(err)) {
        setPendingForce({ appointmentId, professionalId, startTime });
      } else {
        toast.error(err instanceof Error ? err.message : "Erro ao reagendar.");
      }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, professionalId: string) {
    e.preventDefault();
    setDragOverCol(null);
    const appointmentId = e.dataTransfer.getData("appointmentId");
    if (!appointmentId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    let minutes = DAY_START + offsetY / PX_PER_MINUTE;
    minutes = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    void doReschedule(appointmentId, professionalId, `${h}:${m}`);
  }

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
        <button
          className="text-xs text-muted-foreground underline"
          onClick={() => setHidden(new Set())}
        >
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
                className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
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
              <span className="truncate text-sm font-medium">{prof.name}</span>
            </div>
            <div
              className="relative"
              style={{ height: totalHeight }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(prof.id);
              }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, prof.id)}
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
                  className="absolute left-0 right-0 z-20 border-t-2 border-destructive"
                  style={{ top: (minutesNow() - DAY_START) * PX_PER_MINUTE }}
                />
              )}

              {(blocksByProf.get(prof.id) ?? []).map((b) => {
                const top = (timeToMinutes(b.startTime) - DAY_START) * PX_PER_MINUTE;
                const height = (timeToMinutes(b.endTime) - timeToMinutes(b.startTime)) * PX_PER_MINUTE;
                return (
                  <div
                    key={b.id}
                    className="absolute left-0.5 right-0.5 z-10 overflow-hidden rounded border border-destructive/30 bg-[repeating-linear-gradient(45deg,theme(colors.destructive/15%),theme(colors.destructive/15%)_6px,transparent_6px,transparent_12px)] p-1 text-[11px] text-muted-foreground"
                    style={{ top, height: Math.max(height, 16) }}
                    title={b.reason ?? "Bloqueado"}
                  >
                    {b.reason ?? "Bloqueado"}
                  </div>
                );
              })}

              {(appointmentsByProf.get(prof.id) ?? []).map((a) => {
                const top = (timeToMinutes(a.startTime) - DAY_START) * PX_PER_MINUTE;
                const height = (timeToMinutes(a.endTime) - timeToMinutes(a.startTime)) * PX_PER_MINUTE;
                return (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("appointmentId", a.id)}
                    className="absolute left-0.5 right-0.5 z-10 cursor-grab overflow-hidden rounded border p-1 text-[11px] leading-tight active:cursor-grabbing"
                    style={{
                      top,
                      height: Math.max(height, 20),
                      backgroundColor: `${prof.color}33`,
                      borderColor: prof.color,
                    }}
                    title={`${a.client.name} — ${a.services.map((s) => s.service.name).join(" + ")}`}
                  >
                    <p className="truncate font-medium">
                      {a.client.name} {a.forceOverlap && "⚠"}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {a.services.map((s) => s.service.name).join(" + ")}
                    </p>
                    <p className="text-muted-foreground">
                      {a.startTime}–{a.endTime}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!pendingForce} onOpenChange={(open) => !open && setPendingForce(null)}>
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
            <Button variant="outline" onClick={() => setPendingForce(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!reason.trim()}
              onClick={() =>
                pendingForce &&
                doReschedule(
                  pendingForce.appointmentId,
                  pendingForce.professionalId,
                  pendingForce.startTime,
                  { reason },
                )
              }
            >
              Forçar sobreposição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
