export class BookingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingConflictError";
  }
}

/** O trigger check_booking_overlap() (ver migration) levanta RAISE EXCEPTION
 * com uma mensagem em português começando com "Conflito de horário" — Prisma
 * propaga isso envolto num erro genérico; detectamos pelo texto da mensagem. */
export function translateOverlapError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("Conflito de horário")) {
    const match = message.match(/Conflito de horário:[^\\n"]*/);
    return new BookingConflictError(match?.[0] ?? "Conflito de horário.");
  }
  return err instanceof Error ? err : new Error(message);
}
