/** Horários são guardados como string "HH:MM" (ver schema.prisma) — helpers puros de conversão. */

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * Extrai o dia-do-mês-calendário de um valor "somente data" usando
 * componentes UTC. Necessário porque colunas @db.Date do Prisma sempre
 * voltam como um Date ancorado em MEIA-NOITE UTC — se você chamar
 * `.getDate()`/`.getDay()` (locais) num servidor com timezone negativo
 * (ex.: America/Sao_Paulo, UTC-3), a meia-noite UTC já é o dia anterior
 * às 21h local, e o cálculo sai um dia adiantado/atrasado. Usar sempre os
 * getters UTC pra "somente data" evita essa armadilha por completo.
 */
export function dateOnlyParts(date: Date): { year: number; month: number; day: number } {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

/** Dia da semana (0=domingo) de um valor "somente data" — ver dateOnlyParts. */
export function getCalendarWeekday(date: Date): number {
  const { year, month, day } = dateOnlyParts(date);
  return new Date(year, month, day).getDay();
}

/**
 * Combina um valor "somente data" (ver dateOnlyParts) com um horário local
 * "HH:MM" (o expediente da barbearia, sempre no fuso do servidor) num
 * instante real só válido enquanto o servidor rodar no fuso do Brasil —
 * ver Fase 10 / deploy no VPS.
 */
export function combineDateAndTime(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const { year, month, day } = dateOnlyParts(date);
  return new Date(year, month, day, h, m, 0, 0);
}

export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB);
}
