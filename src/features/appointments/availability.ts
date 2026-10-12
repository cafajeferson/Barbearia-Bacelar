import { prisma } from "@/server/db/client";
import { Prisma } from "@/generated/prisma/client";
import {
  addMinutesToTime,
  dateOnlyParts,
  getCalendarWeekday,
  rangesOverlap,
  timeToMinutes,
} from "@/shared/lib/time";

/** "YYYY-MM-DD" com zero à esquerda — mesmo formato do to_char(..., 'YYYY-MM-DD') do SQL abaixo. */
function isoDateKey(date: Date): string {
  const { year, month, day } = dateOnlyParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const SLOT_STEP_MINUTES = 15;

/** Status que ocupam horário na agenda (bloqueiam slot). COMPLETED não bloqueia, mas conta pra "menos ocupado do dia". */
const BUSY_STATUSES = new Set(["SCHEDULED", "CONFIRMED", "IN_PROGRESS"]);

type WindowRow = { professionalId: string; weekday: number; startTime: string; endTime: string };
type AppointmentRow = { professionalId: string; date: string; startTime: string; endTime: string; status: string };
type BlockRow = { professionalId: string; date: string; startTime: string; endTime: string };

type AvailabilityData = {
  windows: WindowRow[];
  appointments: AppointmentRow[];
  blocks: BlockRow[];
};

/** O driver pg costuma devolver colunas json já parseadas, mas dependendo da versão vêm como string. */
function asJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

/**
 * Busca TUDO que o cálculo de disponibilidade precisa (janelas semanais,
 * agendamentos ativos+concluídos e bloqueios de um intervalo de dias) num
 * ÚNICO statement SQL — e portanto num único round-trip ao banco.
 *
 * Por que não withAppContext + findMany: uma transação interativa do Prisma
 * custa BEGIN + set_config + N consultas + COMMIT, cada um uma ida-e-volta
 * própria — com o Supabase em us-east-1 (~300-700ms por ida-e-volta desta
 * rede) o calendário do wizard levava vários segundos só pra pintar as
 * bolinhas dos dias. Aqui o set_config roda numa CTE do MESMO statement
 * (um statement é sua própria transação, então o `true` de is_local
 * garante que o papel NÃO vaza pra conexão poolada em modo sessão), e as
 * três listas voltam como json_agg. 6 idas-e-voltas viram 1.
 *
 * A subconsulta referenciar `ctx.role` não é decorativo: força o Postgres
 * a avaliar a CTE (e portanto o set_config) ANTES de ler as tabelas com
 * RLS — sem isso a ordem de avaliação não seria garantida.
 *
 * Roda sempre como ADMIN internamente: o resultado é dado computado e
 * público o bastante pro fluxo de agendamento do cliente — não é leitura
 * bruta de WeeklyAvailability/BlockedSlot, que não têm policy pra CLIENT.
 * Quem chama continua responsável pelo requireAuth na camada de action.
 */
async function fetchAvailabilityData(
  professionalIds: string[],
  fromIso: string,
  toIso: string,
): Promise<AvailabilityData> {
  if (professionalIds.length === 0) return { windows: [], appointments: [], blocks: [] };

  const ids = Prisma.join(professionalIds);
  const rows = await prisma.$queryRaw<{ windows: unknown; appointments: unknown; blocks: unknown }[]>`
    WITH ctx AS MATERIALIZED (
      SELECT set_config('app.role', 'ADMIN', true) AS role,
             set_config('app.user_id', '', true) AS uid
    )
    SELECT
      (SELECT coalesce(json_agg(json_build_object(
           'professionalId', w."professionalId",
           'weekday', w."weekday",
           'startTime', w."startTime",
           'endTime', w."endTime")), '[]'::json)
         FROM "WeeklyAvailability" w
        WHERE ctx.role = 'ADMIN'
          AND w."professionalId" IN (${ids})
          AND w."active" = true) AS "windows",
      (SELECT coalesce(json_agg(json_build_object(
           'professionalId', a."professionalId",
           'date', to_char(a."scheduledDate", 'YYYY-MM-DD'),
           'startTime', a."startTime",
           'endTime', a."endTime",
           'status', a."status"::text)), '[]'::json)
         FROM "Appointment" a
        WHERE ctx.role = 'ADMIN'
          AND a."professionalId" IN (${ids})
          AND a."scheduledDate" BETWEEN ${fromIso}::date AND ${toIso}::date
          AND a."status"::text IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')) AS "appointments",
      (SELECT coalesce(json_agg(json_build_object(
           'professionalId', b."professionalId",
           'date', to_char(b."date", 'YYYY-MM-DD'),
           'startTime', b."startTime",
           'endTime', b."endTime")), '[]'::json)
         FROM "BlockedSlot" b
        WHERE ctx.role = 'ADMIN'
          AND b."professionalId" IN (${ids})
          AND b."date" BETWEEN ${fromIso}::date AND ${toIso}::date) AS "blocks"
    FROM ctx
  `;

  const row = rows[0];
  return {
    windows: row ? asJson<WindowRow[]>(row.windows) : [],
    appointments: row ? asJson<AppointmentRow[]>(row.appointments) : [],
    blocks: row ? asJson<BlockRow[]>(row.blocks) : [],
  };
}

/** Núcleo puro do cálculo (sem banco) — reaproveitado por todos os caminhos abaixo. */
function computeAvailableSlots(
  windows: { startTime: string; endTime: string }[],
  busy: { startTime: string; endTime: string }[],
  durationMinutes: number,
): string[] {
  const available: string[] = [];
  for (const window of windows) {
    let cursor = timeToMinutes(window.startTime);
    const windowEnd = timeToMinutes(window.endTime);

    while (cursor + durationMinutes <= windowEnd) {
      const slotStart = addMinutesToTime("00:00", cursor);
      const slotEnd = addMinutesToTime(slotStart, durationMinutes);

      const conflicts = busy.some((b) => rangesOverlap(slotStart, slotEnd, b.startTime, b.endTime));
      if (!conflicts) available.push(slotStart);

      cursor += SLOT_STEP_MINUTES;
    }
  }
  return available;
}

/** Slots livres de UM profissional num dia, já com os dados em mãos. */
function computeSlotsForProfessional(
  data: AvailabilityData,
  professionalId: string,
  weekday: number,
  dayIso: string,
  durationMinutes: number,
): string[] {
  const windows = data.windows.filter((w) => w.professionalId === professionalId && w.weekday === weekday);
  if (windows.length === 0) return [];
  const busy = [
    ...data.appointments.filter(
      (a) => a.professionalId === professionalId && a.date === dayIso && BUSY_STATUSES.has(a.status),
    ),
    ...data.blocks.filter((b) => b.professionalId === professionalId && b.date === dayIso),
  ];
  return computeAvailableSlots(windows, busy, durationMinutes);
}

/**
 * Horários livres de um profissional num dia, para uma duração total
 * (soma dos serviços escolhidos). 1 round-trip ao banco.
 */
export async function getAvailableSlots(params: {
  professionalId: string;
  date: Date;
  durationMinutes: number;
}): Promise<string[]> {
  return getUnionAvailableSlots({
    professionalIds: [params.professionalId],
    date: params.date,
    durationMinutes: params.durationMinutes,
  });
}

/** Resumo pro indicador do calendário (bolinha verde/amarela) na tela de agendamento. */
export async function getDayAvailabilityLevel(params: {
  professionalId: string;
  date: Date;
  durationMinutes: number;
}): Promise<"MUITOS" | "POUCOS" | "NENHUM"> {
  const slots = await getAvailableSlots(params);
  if (slots.length === 0) return "NENHUM";
  if (slots.length <= 3) return "POUCOS";
  return "MUITOS";
}

/**
 * União dos horários livres de vários profissionais (usado quando o
 * cliente escolhe "Qualquer Profissional") — dispara toda vez que o
 * cliente clica num dia do calendário do wizard, então é caminho quente:
 * 1 round-trip ao banco, união calculada em memória.
 */
export async function getUnionAvailableSlots(params: {
  professionalIds: string[];
  date: Date;
  durationMinutes: number;
}): Promise<string[]> {
  const { professionalIds, date, durationMinutes } = params;
  if (professionalIds.length === 0) return [];

  const weekday = getCalendarWeekday(date);
  const dayIso = isoDateKey(date);
  const data = await fetchAvailabilityData(professionalIds, dayIso, dayIso);

  const set = new Set<string>();
  for (const professionalId of professionalIds) {
    for (const s of computeSlotsForProfessional(data, professionalId, weekday, dayIso, durationMinutes)) {
      set.add(s);
    }
  }
  return Array.from(set).sort();
}

/**
 * Nível de disponibilidade (união) de cada dia de um mês — alimenta as
 * bolinhas do calendário do wizard. Uma única consulta pro mês inteiro
 * (1 round-trip), níveis computados em memória — contra o Supabase em
 * us-east-1 isso é a diferença entre <1s e dezenas de segundos.
 */
export async function getMonthAvailabilityLevels(params: {
  professionalIds: string[];
  year: number;
  month: number; // 0-11
  durationMinutes: number;
}): Promise<Record<string, "MUITOS" | "POUCOS" | "NENHUM">> {
  const daysInMonth = new Date(params.year, params.month + 1, 0).getDate();
  const mm = String(params.month + 1).padStart(2, "0");
  const fromIso = `${params.year}-${mm}-01`;
  const toIso = `${params.year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

  const data = await fetchAvailabilityData(params.professionalIds, fromIso, toIso);

  const result: Record<string, "MUITOS" | "POUCOS" | "NENHUM"> = {};

  for (let day = 1; day <= daysInMonth; day++) {
    // ISO montado por componentes (não toISOString) pra não depender do fuso do servidor.
    const iso = `${params.year}-${mm}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(params.year, params.month, day).getDay();

    const slotSet = new Set<string>();
    for (const professionalId of params.professionalIds) {
      for (const s of computeSlotsForProfessional(data, professionalId, weekday, iso, params.durationMinutes)) {
        slotSet.add(s);
      }
    }

    result[iso] = slotSet.size === 0 ? "NENHUM" : slotSet.size <= 3 ? "POUCOS" : "MUITOS";
  }

  return result;
}

/**
 * "Qualquer Profissional": entre os candidatos com horário livre naquele
 * slot, escolhe o menos ocupado no dia (menor nº de atendimentos, incluindo
 * COMPLETED), com empate quebrado aleatoriamente. Inspirado no
 * calculateLeastOccupiedBarberForDay do KillyBarbershop, reescrito aqui.
 *
 * Antes: getAvailableSlots (transação própria) POR CANDIDATO + um count
 * POR candidato livre — com 3 barbeiros eram ~20 idas-e-voltas só pra
 * confirmar um agendamento. Agora tudo sai da mesma consulta única
 * (a contagem usa os mesmos agendamentos já buscados).
 */
export async function pickAnyAvailableProfessional(params: {
  candidateProfessionalIds: string[];
  date: Date;
  startTime: string;
  durationMinutes: number;
}): Promise<string | null> {
  const { candidateProfessionalIds, date, startTime, durationMinutes } = params;
  if (candidateProfessionalIds.length === 0) return null;

  const weekday = getCalendarWeekday(date);
  const dayIso = isoDateKey(date);
  const data = await fetchAvailabilityData(candidateProfessionalIds, dayIso, dayIso);

  const free = candidateProfessionalIds.filter((professionalId) =>
    computeSlotsForProfessional(data, professionalId, weekday, dayIso, durationMinutes).includes(startTime),
  );
  if (free.length === 0) return null;

  const withCounts = free.map((professionalId) => ({
    professionalId,
    count: data.appointments.filter((a) => a.professionalId === professionalId && a.date === dayIso).length,
  }));
  const minCount = Math.min(...withCounts.map((w) => w.count));
  const leastBusy = withCounts.filter((w) => w.count === minCount);
  const pick = leastBusy[Math.floor(Math.random() * leastBusy.length)];

  return pick.professionalId;
}
