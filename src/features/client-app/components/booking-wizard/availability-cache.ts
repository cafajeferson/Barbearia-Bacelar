"use client";

import {
  getMonthAvailabilityAction,
  getUnionAvailableSlotsAction,
} from "@/features/appointments/actions";

/**
 * Cache client-side (por aba) das consultas de disponibilidade do wizard,
 * com TTL curto. Dois objetivos:
 *
 * 1. PRÉ-BUSCA: a tela de produtos vem ANTES da agenda, e nela o cliente
 *    já escolheu serviços (duração) e profissional — o wizard dispara a
 *    busca do mês em segundo plano enquanto o cliente olha os produtos,
 *    então a agenda abre com as bolinhas já pintadas (a promise fica aqui
 *    e o passo da agenda a reaproveita em vez de refazer a request).
 * 2. NAVEGAÇÃO: voltar para um mês/dia já visitado dentro do TTL não
 *    refaz a request.
 *
 * Staleness assumida (TTL 60s): igual à do resto do app — quem confirma
 * o agendamento passa pela validação de conflito no servidor de qualquer
 * jeito, então o pior caso é ver um horário que acabou de ser tomado e
 * receber o erro amigável na confirmação.
 */
const TTL_MS = 60_000;

type Levels = Record<string, "MUITOS" | "POUCOS" | "NENHUM">;

const cache = new Map<string, { promise: Promise<unknown>; at: number }>();

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise as Promise<T>;

  const promise = fetcher().catch((err) => {
    // Falha não fica cacheada — a próxima chamada tenta de novo.
    cache.delete(key);
    throw err;
  });
  cache.set(key, { promise, at: Date.now() });
  return promise;
}

function idsKey(professionalIds: string[]): string {
  return professionalIds.slice().sort().join(",");
}

export function fetchMonthLevels(params: {
  professionalIds: string[];
  year: number;
  month: number; // 0-11
  durationMinutes: number;
}): Promise<Levels> {
  const key = `month|${idsKey(params.professionalIds)}|${params.year}-${params.month}|${params.durationMinutes}`;
  return cached(key, () => getMonthAvailabilityAction(params));
}

export function fetchDaySlots(params: {
  professionalIds: string[];
  date: string; // "YYYY-MM-DD"
  durationMinutes: number;
}): Promise<string[]> {
  const key = `day|${idsKey(params.professionalIds)}|${params.date}|${params.durationMinutes}`;
  return cached(key, () => getUnionAvailableSlotsAction(params));
}

/** Dispara a busca do mês em segundo plano sem se importar com o resultado (pré-busca). */
export function prefetchMonthLevels(params: {
  professionalIds: string[];
  year: number;
  month: number;
  durationMinutes: number;
}): void {
  fetchMonthLevels(params).catch(() => {});
}
