import { withAppContext } from "@/server/db/context";
import {
  addMinutesToTime,
  getCalendarWeekday,
  rangesOverlap,
  timeToMinutes,
} from "@/shared/lib/time";

const SLOT_STEP_MINUTES = 15;

/**
 * Calcula os horários livres de um profissional num dia, para uma duração
 * total (soma dos serviços escolhidos). Roda sempre em contexto ADMIN
 * internamente: o resultado (lista de horários) é dado computado e público
 * o bastante para o fluxo de agendamento do cliente — não é leitura bruta
 * de WeeklyAvailability/BlockedSlot, que não têm policy de RLS para CLIENT.
 */
export async function getAvailableSlots(params: {
  professionalId: string;
  date: Date;
  durationMinutes: number;
}): Promise<string[]> {
  const { professionalId, date, durationMinutes } = params;
  const weekday = getCalendarWeekday(date);

  return withAppContext({ role: "ADMIN", userId: null }, async (tx) => {
    // Mesma conexão da transação — em série, nunca Promise.all aqui.
    const windows = await tx.weeklyAvailability.findMany({
      where: { professionalId, weekday, active: true },
    });
    const appointments = await tx.appointment.findMany({
      where: {
        professionalId,
        scheduledDate: date,
        status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] },
      },
      select: { startTime: true, endTime: true },
    });
    const blocks = await tx.blockedSlot.findMany({
      where: { professionalId, date },
      select: { startTime: true, endTime: true },
    });

    const busy = [...appointments, ...blocks];
    const available: string[] = [];

    for (const window of windows) {
      let cursor = timeToMinutes(window.startTime);
      const windowEnd = timeToMinutes(window.endTime);

      while (cursor + durationMinutes <= windowEnd) {
        const slotStart = addMinutesToTime("00:00", cursor);
        const slotEnd = addMinutesToTime(slotStart, durationMinutes);

        const conflicts = busy.some((b) =>
          rangesOverlap(slotStart, slotEnd, b.startTime, b.endTime),
        );
        if (!conflicts) available.push(slotStart);

        cursor += SLOT_STEP_MINUTES;
      }
    }

    return available;
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

/** União dos horários livres de vários profissionais (usado quando o cliente escolhe "Qualquer Profissional"). */
export async function getUnionAvailableSlots(params: {
  professionalIds: string[];
  date: Date;
  durationMinutes: number;
}): Promise<string[]> {
  const set = new Set<string>();
  for (const professionalId of params.professionalIds) {
    const slots = await getAvailableSlots({ professionalId, date: params.date, durationMinutes: params.durationMinutes });
    for (const s of slots) set.add(s);
  }
  return Array.from(set).sort();
}

/** Nível de disponibilidade (união) de cada dia de um mês — alimenta as bolinhas do calendário do wizard. */
export async function getMonthAvailabilityLevels(params: {
  professionalIds: string[];
  year: number;
  month: number; // 0-11
  durationMinutes: number;
}): Promise<Record<string, "MUITOS" | "POUCOS" | "NENHUM">> {
  const daysInMonth = new Date(params.year, params.month + 1, 0).getDate();
  const result: Record<string, "MUITOS" | "POUCOS" | "NENHUM"> = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(params.year, params.month, day);
    const slots = await getUnionAvailableSlots({
      professionalIds: params.professionalIds,
      date,
      durationMinutes: params.durationMinutes,
    });
    const iso = date.toISOString().slice(0, 10);
    result[iso] = slots.length === 0 ? "NENHUM" : slots.length <= 3 ? "POUCOS" : "MUITOS";
  }

  return result;
}

/**
 * "Qualquer Profissional": entre os candidatos com horário livre naquele
 * slot, escolhe o menos ocupado no dia (menor nº de atendimentos), com
 * empate quebrado aleatoriamente. Inspirado no
 * calculateLeastOccupiedBarberForDay do KillyBarbershop, reescrito aqui.
 */
export async function pickAnyAvailableProfessional(params: {
  candidateProfessionalIds: string[];
  date: Date;
  startTime: string;
  durationMinutes: number;
}): Promise<string | null> {
  const { candidateProfessionalIds, date, startTime, durationMinutes } =
    params;

  const availability = await Promise.all(
    candidateProfessionalIds.map(async (professionalId) => {
      const slots = await getAvailableSlots({
        professionalId,
        date,
        durationMinutes,
      });
      return { professionalId, isFree: slots.includes(startTime) };
    }),
  );

  const free = availability.filter((a) => a.isFree).map((a) => a.professionalId);
  if (free.length === 0) return null;

  return withAppContext({ role: "ADMIN", userId: null }, async (tx) => {
    // Mesma conexão da transação — contagens em série, não em paralelo.
    const withCounts: { professionalId: string; count: number }[] = [];
    for (const professionalId of free) {
      const count = await tx.appointment.count({
        where: {
          professionalId,
          scheduledDate: date,
          status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] },
        },
      });
      withCounts.push({ professionalId, count });
    }
    const minCount = Math.min(...withCounts.map((w) => w.count));
    const leastBusy = withCounts.filter((w) => w.count === minCount);
    const pick = leastBusy[Math.floor(Math.random() * leastBusy.length)];

    return pick.professionalId;
  });
}
