/**
 * Undo and redo over a whole value, for the planning pages.
 *
 * The script has CodeMirror's history; a shotlist or a stripboard is a JSON
 * value, so its history is simply earlier values. Typing into one field is
 * gathered into a single step (a `group` that stays the same while the
 * writer keeps typing there), so Ctrl+Z takes back the edit, not one letter.
 *
 * Pure: the hook in `lib/hooks/useUndoable.ts` holds one of these.
 */

export interface History<T> {
  past: T[];
  future: T[];
  /** The group of the last step, and when it was made. */
  lastGroup: string | null;
  lastAt: number;
}

export const LIMIT = 100;
/** Typing that pauses longer than this starts a new undo step. */
export const GROUP_WINDOW = 1_200;

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [], lastGroup: null, lastAt: 0 });

/** Records that `previous` was replaced. Returns the new history. */
export function record<T>(history: History<T>, previous: T, group: string | null, now: number): History<T> {
  const merge = group !== null && group === history.lastGroup && now - history.lastAt < GROUP_WINDOW && history.past.length > 0;
  const past = merge ? history.past : [...history.past, previous].slice(-LIMIT);
  return { past, future: [], lastGroup: group, lastAt: now };
}

export function undo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = history.past[history.past.length - 1];
  if (value === undefined) return null;
  return {
    value,
    history: { past: history.past.slice(0, -1), future: [current, ...history.future], lastGroup: null, lastAt: 0 },
  };
}

export function redo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  const [value, ...rest] = history.future;
  if (value === undefined) return null;
  return {
    value,
    history: { past: [...history.past, current].slice(-LIMIT), future: rest, lastGroup: null, lastAt: 0 },
  };
}
