/**
 * A message worth showing, out of whatever got thrown.
 *
 * A real `Error` is the easy case. Supabase's own `PostgrestError` is not
 * one — it is a plain `{ message, details, hint, code }` object — so
 * `instanceof Error` silently misses it and a naive `String(x)` collapses it
 * to `"[object Object]"`. That is worse than no handling at all: it looks
 * like an error was shown when the writer got nothing they could act on.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : null;
    const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : null;
    if (message) return hint ? `${message} (${hint})` : message;
  }

  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
