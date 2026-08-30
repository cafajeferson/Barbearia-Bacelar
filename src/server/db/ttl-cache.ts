/**
 * Memoização em memória com TTL pra consultas quase-estáticas (unidades,
 * etc.) que rodam em TODA navegação via layout — cada uma custa uma
 * transação inteira (~400-600ms daqui até o Supabase em us-east-1).
 * Processo único (server standalone), então um Map de módulo é confiável.
 */
const store = new Map<string, { value: unknown; expiresAt: number }>();

export async function ttlCached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidateTtlCache(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}
