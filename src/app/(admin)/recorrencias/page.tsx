import { AlertTriangle } from "lucide-react";
import { getAuthContext } from "@/server/auth/getAuthContext";
import { getRecurrenciasData } from "@/features/recurring-series/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { initials, formatBRL } from "@/shared/lib/format";
import { cn } from "@/lib/utils";
import { PendingSeriesActions } from "@/features/recurring-series/components/pending-series-actions";
import { SeriesMenuActions } from "@/features/recurring-series/components/series-menu-actions";
import { RefreshButton } from "@/features/recurring-series/components/refresh-button";

type SeriesItem = Awaited<ReturnType<typeof getRecurrenciasData>>["saudaveis"][number];

const WEEKDAY_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const WEEKDAY_FULL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTH_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function daysDiff(date: Date, from: Date) {
  const a = new Date(date);
  a.setHours(0, 0, 0, 0);
  const b = new Date(from);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function DateBadge({ date }: { date: Date }) {
  const diff = daysDiff(date, new Date());
  const highlight = diff === 0 || diff === 1;
  return (
    <Badge
      variant="outline"
      className={cn(
        "flex w-16 flex-col gap-0 py-1 text-center leading-tight",
        highlight ? "border-primary text-primary" : "text-muted-foreground",
      )}
    >
      {diff === 0 ? (
        <span className="text-[10px] font-semibold">HOJE</span>
      ) : diff === 1 ? (
        <span className="text-[10px] font-semibold">AMANHÃ</span>
      ) : (
        <span className="text-[10px]">{WEEKDAY_SHORT[date.getDay()]}</span>
      )}
      <span className="text-sm font-semibold">{date.getDate()}</span>
      {diff !== 0 && diff !== 1 && <span className="text-[10px]">{MONTH_SHORT[date.getMonth()]}</span>}
    </Badge>
  );
}

function relativeLabel(date: Date) {
  const diff = daysDiff(date, new Date());
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff > 1) return `em ${diff}d`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function cadenceLabel(intervalDays: number) {
  if (intervalDays === 7) return "Toda semana";
  if (intervalDays === 14) return "A cada 2 semanas";
  if (intervalDays >= 28 && intervalDays <= 31) return "Todo mês";
  return `A cada ${intervalDays} dias`;
}

function monthsSince(date: Date) {
  const now = new Date();
  return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth()));
}

function PendingRow({ item }: { item: SeriesItem }) {
  const daysAgo = daysDiff(new Date(), item.createdAt);
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <DateBadge date={item.startDate} />
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
        {initials(item.client.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.client.name} <span className="font-normal text-muted-foreground">com {item.professional.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {cadenceLabel(item.intervalDays)}, {WEEKDAY_FULL[item.startDate.getDay()]}, às {item.startTime} ·{" "}
          {item.serviceNames.join(" + ")} · começa{" "}
          {new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(item.startDate)} ·{" "}
          {formatBRL(item.pricePerOccurrence)} cada
        </p>
      </div>
      <p className="whitespace-nowrap text-xs text-muted-foreground">há {daysAgo}d</p>
      <PendingSeriesActions seriesId={item.id} />
    </div>
  );
}

function AtRiskRow({ item }: { item: SeriesItem }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <DateBadge date={item.startDate} />
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
        {initials(item.client.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.client.name} <span className="font-normal text-muted-foreground">com {item.professional.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {item.serviceNames.join(" + ")} · {formatBRL(item.pricePerOccurrence)} · {cadenceLabel(item.intervalDays)},{" "}
          {WEEKDAY_FULL[item.startDate.getDay()]}, às {item.startTime}
        </p>
        <p className="text-xs text-muted-foreground">cliente fixo há {monthsSince(item.createdAt)} meses</p>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {item.nextAppointment ? (
          <>
            <p>
              Próximo:{" "}
              {new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(
                item.nextAppointment.scheduledDate,
              )}
            </p>
            <p>
              às {item.nextAppointment.startTime} · {item.remaining} restantes
            </p>
          </>
        ) : (
          <p>Sem próxima data — conflito não resolvido</p>
        )}
      </div>
      <SeriesMenuActions seriesId={item.id} />
    </div>
  );
}

function HealthyRow({ item }: { item: SeriesItem }) {
  const date = item.nextAppointment?.scheduledDate;
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      {date ? <DateBadge date={date} /> : <div className="w-16" />}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
        {initials(item.client.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.client.name} <span className="font-normal text-muted-foreground">com {item.professional.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {date ? relativeLabel(date) : "—"} · às {item.nextAppointment?.startTime ?? "—"} · {item.remaining} restantes
        </p>
      </div>
      <SeriesMenuActions seriesId={item.id} />
    </div>
  );
}

export default async function RecorrenciasPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { pendentes, emAtencao, saudaveis } = await getRecurrenciasData({ ctx });

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Recorrências</h1>
          <p className="text-muted-foreground">
            Pedidos novos e clientes fixos numa lista só, do mais urgente ao saudável
          </p>
        </div>
        <RefreshButton />
      </div>

      {emAtencao.length > 0 && (
        <Card className="flex items-center gap-3 border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <p className="text-sm font-medium">
            Tem coisa pra ver: {emAtencao.length} série{emAtencao.length > 1 ? "s" : ""} em atenção →
          </p>
        </Card>
      )}

      {pendentes.length === 0 && emAtencao.length === 0 && saudaveis.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma recorrência ainda. Elas aparecem aqui quando um cliente ativa
          &ldquo;Agendamento recorrente&rdquo; no app.
        </Card>
      ) : (
        <>
          {pendentes.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">
                Pendentes <span className="text-muted-foreground">{pendentes.length}</span>{" "}
                <span className="font-normal text-muted-foreground">· aguardando sua decisão</span>
              </h2>
              <Card className="divide-y p-0">
                {pendentes.map((item) => (
                  <PendingRow key={item.id} item={item} />
                ))}
              </Card>
            </div>
          )}

          {emAtencao.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-warning">
                Em atenção <span>{emAtencao.length}</span>{" "}
                <span className="font-normal text-muted-foreground">· precisa olhar</span>
              </h2>
              <Card className="divide-y p-0">
                {emAtencao.map((item) => (
                  <AtRiskRow key={item.id} item={item} />
                ))}
              </Card>
            </div>
          )}

          {saudaveis.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-success">
                Saudáveis <span>{saudaveis.length}</span>{" "}
                <span className="font-normal text-muted-foreground">· cliente fixo, em ritmo</span>
              </h2>
              <Card className="divide-y p-0">
                {saudaveis.map((item) => (
                  <HealthyRow key={item.id} item={item} />
                ))}
              </Card>
            </div>
          )}
        </>
      )}
    </main>
  );
}
