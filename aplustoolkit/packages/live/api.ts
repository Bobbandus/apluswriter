import type { LiveAction } from './board';
import type { BoardKind } from './types';

/**
 * The buttons a Stream Deck (or any HTTP client) can press, by name.
 *
 * `/api/live/<control link>/<name>` does what the button of that name does on the control page. The names are
 * short and made of words and dashes so they are easy to put in a Stream Deck "website" action. One place
 * decides what each name means for each kind of board, and it is plain data in and an action out, so it is
 * tested without a server.
 */

const SIDES = { a: 'a', b: 'b' } as const;

/** Every name a board of this kind answers to, for showing them next to the link. */
export const API_NAMES: Record<BoardKind, string[]> = {
  score: ['a-plus', 'a-minus', 'b-plus', 'b-minus', 'swap', 'reset'],
  pingis: ['point-a', 'point-b', 'undo', 'next-game'],
  handball: ['a-plus', 'a-minus', 'b-plus', 'b-minus', 'clock-start', 'clock-stop', 'suspend-a', 'suspend-b', 'timeout-a', 'timeout-b', 'half-1', 'half-2'],
  ranking: ['reset-points', 'highlight-none', 'highlight-1', 'highlight-2', 'highlight-3'],
  lower: ['show', 'hide', 'next', 'prev', 'show-1', 'show-2', 'show-3'],
};

/** The action a name stands for on a board of `kind`, or null when the board has no such button. `now` is in milliseconds. */
export function actionForName(kind: BoardKind, rawName: string, now: number): LiveAction | null {
  const name = rawName.toLowerCase();

  if (kind === 'score' || kind === 'handball') {
    const goal = /^([ab])-(plus|minus)$/.exec(name);
    if (goal) {
      const side = SIDES[goal[1] as 'a' | 'b'];
      return goal[2] === 'plus' ? { type: 'add', side } : { type: 'sub', side };
    }
    if (kind === 'score') {
      if (name === 'swap') return { type: 'swap' };
      if (name === 'reset') return { type: 'reset' };
      return null;
    }
    if (name === 'clock-start') return { type: 'start', at: now };
    if (name === 'clock-stop') return { type: 'stop', at: now };
    const suspension = /^suspend-([ab])$/.exec(name);
    if (suspension) return { type: 'suspend', side: SIDES[suspension[1] as 'a' | 'b'], at: now };
    const timeout = /^timeout-([ab])$/.exec(name);
    if (timeout) return { type: 'timeout', side: SIDES[timeout[1] as 'a' | 'b'], at: now };
    if (name === 'timeout-end') return { type: 'endTimeout' };
    const half = /^half-([1-4])$/.exec(name);
    if (half) return { type: 'period', period: Number(half[1]) as 1 | 2 | 3 | 4 };
    return null;
  }

  if (kind === 'pingis') {
    const point = /^point-([ab])$/.exec(name);
    if (point) return { type: 'point', side: SIDES[point[1] as 'a' | 'b'] };
    if (name === 'undo') return { type: 'undo' };
    if (name === 'next-game') return { type: 'nextGame' };
    return null;
  }

  if (kind === 'ranking') {
    if (name === 'reset-points') return { type: 'resetPoints' };
    if (name === 'highlight-none') return { type: 'highlight', index: -1 };
    const pick = /^highlight-(\d{1,2})$/.exec(name);
    return pick && Number(pick[1]) >= 1 ? { type: 'highlight', index: Number(pick[1]) - 1 } : null;
  }

  if (name === 'show') return { type: 'show' };
  if (name === 'hide') return { type: 'hide' };
  if (name === 'next') return { type: 'next' };
  if (name === 'prev') return { type: 'prev' };
  const item = /^show-(\d{1,3})$/.exec(name);
  // Numbers are counted from 1, as they are on the control page.
  if (item && Number(item[1]) >= 1) return { type: 'show', index: Number(item[1]) - 1 };
  return null;
}
