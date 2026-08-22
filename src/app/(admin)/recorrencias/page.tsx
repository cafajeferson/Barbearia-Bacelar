import { AlertTriangle, ChevronRight } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { listRecurringSeries } from "@/features/recurring-series/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/shared/lib/format";

function dateBadge(date: Date | undefined) {
  if (!date) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return "HOJE";
  if (d.getTime() === tomorrow.getTime()) return "AMANHÃ";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function SeriesRow({ item }: { item: Awaited<ReturnType<typeof listRecurringSeries>>[number] }) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <Badge variant="outline" className="w-16 justify-center">
        {dateBadge(item.nextAppointment?.scheduledDate)}
      </Badge>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
        {initials(item.client.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.client.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {item.professional.name} · a cada {item.intervalDays} dias
        </p>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <p>{item.nextAppointment?.startTime ?? "—"}</p>
        <p>{item.remaining} restantes</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

export default async function RecorrenciasPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const series = await listRecurringSeries({ ctx });
  const emAtencao = series.filter((s) => s.riskFlag);
  const saudaveis = series.filter((s) => !s.riskFlag);

  return (
    <main className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Recorrências</h1>
        <p className="text-muted-foreground">Clientes fixos, do mais urgente ao mais saudável</p>
      </div>

      {emAtencao.length > 0 && (
        <Card className="flex items-center gap-3 border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <p className="text-sm font-medium">
            Tem coisa pra ver: {emAtencao.length} série(s) em atenção
          </p>
        </Card>
      )}

      {series.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma recorrência ainda. Elas aparecem aqui quando um cliente ativa
          &ldquo;Agendamento recorrente&rdquo; no app (Fase 5).
        </Card>
      ) : (
        <>
          {emAtencao.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-warning">Em atenção</h2>
              <Card className="divide-y p-0">
                {emAtencao.map((item) => (
                  <SeriesRow key={item.id} item={item} />
                ))}
              </Card>
            </div>
          )}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-success">Saudáveis</h2>
            <Card className="divide-y p-0">
              {saudaveis.map((item) => (
                <SeriesRow key={item.id} item={item} />
              ))}
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
