import Link from "next/link";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listAppointments } from "@/features/appointments/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelAppointmentButton } from "@/features/client-app/components/cancel-appointment-button";
import { formatBRL } from "@/shared/lib/format";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

export default async function HorariosPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const appointments = await listAppointments({ ctx, clientId: ctx.userId ?? undefined });
  const now = new Date();
  const upcoming = appointments.filter(
    (a) => a.scheduledDate >= new Date(now.toDateString()) && !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(a.status),
  );
  const history = appointments.filter((a) => !upcoming.includes(a));

  return (
    <main className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Meus horários</h1>
        <Button size="sm" asChild>
          <Link href="/agendar">Agendar</Link>
        </Button>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Próximos</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((a) => (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{a.services.map((s) => s.service.name).join(" + ")}</p>
                  <Badge variant="outline">{STATUS_LABEL[a.status]}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(a.scheduledDate)} às{" "}
                  {a.startTime} · {a.professional.name}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-semibold">{formatBRL(Number(a.totalPrice))}</span>
                  <CancelAppointmentButton appointmentId={a.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Histórico</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum atendimento anterior.</p>
        ) : (
          <div className="space-y-2">
            {history.map((a) => (
              <div key={a.id} className="rounded-lg border p-3 opacity-80">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{a.services.map((s) => s.service.name).join(" + ")}</p>
                  <Badge variant="outline">{STATUS_LABEL[a.status]}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat("pt-BR").format(a.scheduledDate)} às {a.startTime} · {a.professional.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
