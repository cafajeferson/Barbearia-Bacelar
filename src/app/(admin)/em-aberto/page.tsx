import { CheckCircle2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listOpenAppointments } from "@/features/appointments/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppointmentStatusActions } from "@/features/professionals/components/appointment-status-actions";
import { formatBRL } from "@/shared/lib/format";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

export default async function EmAbertoPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const openAppointments = await listOpenAppointments({ ctx });

  return (
    <main className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Em aberto ({openAppointments.length})</h1>
        <p className="text-muted-foreground">
          Atendimentos agendados há mais de 24h que ainda não foram fechados — confirme o que aconteceu com cada
          um.
        </p>
      </div>

      {openAppointments.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
          <p className="font-medium">Tudo em dia</p>
          <p className="text-sm text-muted-foreground">Nenhum atendimento parado sem fechamento.</p>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Serviço(s)</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {openAppointments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.client.name}</p>
                    <p className="text-xs text-muted-foreground">{a.client.phone}</p>
                  </TableCell>
                  <TableCell>{a.professional.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.services.map((s) => s.service.name).join(" + ")}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">
                      {new Intl.DateTimeFormat("pt-BR").format(a.scheduledDate)} · {a.startTime}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-warning">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(a.scheduledAt, { locale: ptBR, addSuffix: true })}
                    </p>
                  </TableCell>
                  <TableCell className="font-medium">{formatBRL(Number(a.totalPrice))}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{STATUS_LABEL[a.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <AppointmentStatusActions appointmentId={a.id} status={a.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
