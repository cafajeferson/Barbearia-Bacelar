import Link from "next/link";
import { Bot, CheckCircle2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listOpenAppointments } from "@/features/appointments/service";
import { endOfPreviousMonth, listClosedBySystem } from "@/features/appointments/autoClose";
import { CloseUntilButton } from "@/features/appointments/components/close-until-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppointmentStatusActions } from "@/features/professionals/components/appointment-status-actions";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/lib/format";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

/** Data "somente data" (meia-noite UTC) em dd/mm/aaaa sem escorregar de dia pelo fuso. */
const formatDay = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(d);

export default async function EmAbertoPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { aba } = await searchParams;
  const showClosed = aba === "sistema";
  const [openAppointments, closedBySystem] = await Promise.all([
    listOpenAppointments({ ctx }),
    showClosed ? listClosedBySystem({ ctx }) : Promise.resolve([]),
  ]);

  const until = endOfPreviousMonth();
  const untilKey = until.toISOString().slice(0, 10);
  const closableCount = openAppointments.filter((a) => a.scheduledDate.toISOString().slice(0, 10) <= untilKey).length;
  const untilMonthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(until);

  const tab = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium",
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
    );

  return (
    <main className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Em aberto ({openAppointments.length})</h1>
          <p className="text-muted-foreground">Atendimentos que já terminaram sem resolução</p>
        </div>
        <CloseUntilButton monthLabel={untilMonthLabel} count={closableCount} />
      </div>

      <div className="flex w-fit gap-1 rounded-lg border p-1">
        <Link href="/em-aberto" prefetch={false} className={tab(!showClosed)}>
          Em aberto
        </Link>
        <Link href="/em-aberto?aba=sistema" prefetch={false} className={tab(showClosed)}>
          Fechados pelo sistema
        </Link>
      </div>

      {showClosed ? (
        closedBySystem.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <Bot className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhum atendimento fechado pelo sistema</p>
            <p className="text-sm text-muted-foreground">Nos últimos 60 dias.</p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedBySystem.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <p className="font-medium">{a.client.name}</p>
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        Fechado pelo sistema
                      </Badge>
                    </TableCell>
                    <TableCell>{a.professional.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.services.map((s) => s.service.name).join(" + ")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDay(a.scheduledDate)} · {a.startTime}
                    </TableCell>
                    <TableCell className="font-medium">{formatBRL(Number(a.totalPrice))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : openAppointments.length === 0 ? (
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
                    <p className="whitespace-nowrap text-sm">
                      {formatDay(a.scheduledDate)} · {a.startTime}
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
