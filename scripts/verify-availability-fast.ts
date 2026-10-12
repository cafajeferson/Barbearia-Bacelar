/**
 * Verificação pontual da otimização de disponibilidade (1 round-trip):
 * compara o resultado das funções novas com a lógica antiga (withAppContext
 * + findMany em série) no banco real, e mede os tempos.
 *
 * Rodar: npx tsx scripts/verify-availability-fast.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/server/db/client";
import { withAppContext } from "../src/server/db/context";
import {
  getUnionAvailableSlots,
  getMonthAvailabilityLevels,
} from "../src/features/appointments/availability";
import {
  addMinutesToTime,
  getCalendarWeekday,
  rangesOverlap,
  timeToMinutes,
} from "../src/shared/lib/time";

function oldComputeSlots(
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
      if (!busy.some((b) => rangesOverlap(slotStart, slotEnd, b.startTime, b.endTime)))
        available.push(slotStart);
      cursor += SLOT_STEP;
    }
  }
  return available;
}
const SLOT_STEP = 15;

async function oldUnionSlots(professionalIds: string[], date: Date, durationMinutes: number) {
  const weekday = getCalendarWeekday(date);
  return withAppContext({ role: "ADMIN", userId: null }, async (tx) => {
    const windows = await tx.weeklyAvailability.findMany({
      where: { professionalId: { in: professionalIds }, weekday, active: true },
    });
    const appointments = await tx.appointment.findMany({
      where: {
        professionalId: { in: professionalIds },
        scheduledDate: date,
        status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] },
      },
      select: { professionalId: true, startTime: true, endTime: true },
    });
    const blocks = await tx.blockedSlot.findMany({
      where: { professionalId: { in: professionalIds }, date },
      select: { professionalId: true, startTime: true, endTime: true },
    });
    const set = new Set<string>();
    for (const professionalId of professionalIds) {
      const ownWindows = windows.filter((w) => w.professionalId === professionalId);
      const busy = [
        ...appointments.filter((a) => a.professionalId === professionalId),
        ...blocks.filter((b) => b.professionalId === professionalId),
      ];
      for (const s of oldComputeSlots(ownWindows, busy, durationMinutes)) set.add(s);
    }
    return Array.from(set).sort();
  });
}

async function main() {
  const professionals = await withAppContext({ role: "ADMIN", userId: null }, (tx) =>
    tx.professional.findMany({ where: { active: true }, select: { id: true, name: true } }),
  );
  const ids = professionals.map((p) => p.id);
  assert(ids.length > 0, "Nenhum profissional ativo no banco.");
  console.log(`Profissionais ativos: ${professionals.map((p) => p.name).join(", ")}`);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const duration = 30;

  // --- Mês inteiro (bolinhas do calendário) ---
  let t = Date.now();
  const levels = await getMonthAvailabilityLevels({ professionalIds: ids, year, month, durationMinutes: duration });
  const newMonthMs = Date.now() - t;
  console.log(`\ngetMonthAvailabilityLevels (novo, 1 round-trip): ${newMonthMs}ms`);

  // --- Dia a dia: novo vs antigo, resultados devem bater ---
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const sampleDays = [1, 10, 15, 20, daysInMonth].filter((d, i, a) => a.indexOf(d) === i);
  let newDayTotal = 0;
  let oldDayTotal = 0;
  for (const day of sampleDays) {
    const date = new Date(Date.UTC(year, month, day)); // meia-noite UTC, como @db.Date do Prisma
    t = Date.now();
    const novo = await getUnionAvailableSlots({ professionalIds: ids, date, durationMinutes: duration });
    newDayTotal += Date.now() - t;
    t = Date.now();
    const antigo = await oldUnionSlots(ids, date, duration);
    oldDayTotal += Date.now() - t;
    assert.deepEqual(novo, antigo, `Dia ${day}: novo ${JSON.stringify(novo)} != antigo ${JSON.stringify(antigo)}`);

    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const expectedLevel = novo.length === 0 ? "NENHUM" : novo.length <= 3 ? "POUCOS" : "MUITOS";
    assert.equal(levels[iso], expectedLevel, `Nível do dia ${iso} não bate com os slots do dia.`);
    console.log(`Dia ${iso}: ${novo.length} slots, nível ${levels[iso]} — OK (novo e antigo idênticos)`);
  }

  console.log(`\nTempo médio por dia — novo: ${Math.round(newDayTotal / sampleDays.length)}ms | antigo: ${Math.round(oldDayTotal / sampleDays.length)}ms`);
  console.log("\nTudo OK: resultados idênticos aos da lógica antiga.");

  // set_config não pode vazar pra conexão poolada (modo sessão do Supabase):
  const leaked = await prisma.$queryRaw<{ role: string | null }[]>`SELECT current_setting('app.role', true) AS role`;
  assert(!leaked[0]?.role, `app.role vazou pra sessão poolada: "${leaked[0]?.role}"`);
  console.log("Sem vazamento de app.role na conexão poolada — OK.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
