import { applyScore, defaultScore, type ScoreAction } from './score';
import type { HandballState, ScoreState, Side } from './types';

/**
 * Handball: a score, a match clock that counts up through two halves of 30 minutes, and two-minute suspensions
 * that run out with the clock.
 *
 * Time is never read in here. Every action that depends on the moment carries it (`at`, in milliseconds), so the
 * rules are plain functions that can be tested and replayed, and the page that draws the board decides what "now"
 * is. Two devices agree on the clock as far as their own clocks agree, which is to within a second or two when both
 * keep time from the network.
 */

export const HALF_MS = 30 * 60 * 1000;
export const SUSPENSION_MS = 2 * 60 * 1000;
const MAX_SUSPENSIONS = 3;

export const defaultHandball = (): HandballState => ({
  ...defaultScore(),
  period: 1,
  timer: { base: 0, since: null },
  penalties: { a: [], b: [] },
});

/** Milliseconds on the match clock at `at`. */
export function elapsedMs(state: Pick<HandballState, 'timer'>, at: number): number {
  const { base, since } = state.timer;
  return since === null ? base : base + Math.max(0, at - since);
}

export type HandballAction =
  | ScoreAction
  | { type: 'start'; at: number }
  | { type: 'stop'; at: number }
  | { type: 'setClock'; ms: number; at: number }
  | { type: 'adjust'; by: number; at: number }
  | { type: 'period'; period: 1 | 2 | 3 | 4 }
  | { type: 'suspend'; side: Side; at: number }
  | { type: 'endSuspension'; side: Side; index: number };

const SCORE_ACTIONS = new Set(['add', 'sub', 'set', 'reset', 'swap', 'rename', 'label', 'clock']);

export function applyHandball(state: HandballState, action: HandballAction): HandballState {
  if (SCORE_ACTIONS.has(action.type)) {
    const scored = applyScore(state as ScoreState, action as ScoreAction);
    // Swapping sides swaps the suspensions too, or a penalty would stay with the wrong team.
    const swapped = action.type === 'swap';
    return { ...state, ...scored, penalties: swapped ? { a: state.penalties.b, b: state.penalties.a } : state.penalties };
  }

  switch (action.type) {
    case 'start':
      return state.timer.since === null ? { ...state, timer: { base: state.timer.base, since: action.at } } : state;

    case 'stop':
      return state.timer.since === null ? state : { ...state, timer: { base: elapsedMs(state, action.at), since: null } };

    case 'setClock': {
      const ms = Math.max(0, Math.min(action.ms, 4 * HALF_MS));
      return { ...state, timer: { base: ms, since: state.timer.since === null ? null : action.at } };
    }

    case 'adjust': {
      const ms = Math.max(0, elapsedMs(state, action.at) + action.by);
      return { ...state, timer: { base: ms, since: state.timer.since === null ? null : action.at } };
    }

    // A period starts with the clock stopped at where the period begins: 30:00 for the second half.
    case 'period':
      return { ...state, period: action.period, timer: { base: (action.period - 1) * HALF_MS, since: null } };

    case 'suspend': {
      const now = elapsedMs(state, action.at);
      const running = state.penalties[action.side].filter((until) => until > now);
      if (running.length >= MAX_SUSPENSIONS) return state;
      return { ...state, penalties: { ...state.penalties, [action.side]: [...running, now + SUSPENSION_MS] } };
    }

    case 'endSuspension':
      return { ...state, penalties: { ...state.penalties, [action.side]: state.penalties[action.side].filter((_, i) => i !== action.index) } };

    default:
      return state;
  }
}

/** `mm:ss`, with minutes past 59 kept as minutes (handball clocks run to 60:00 and beyond). */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** What is left of each suspension at `at`, as `m:ss`, longest first. Those that have run out are gone. */
export function penaltiesLeft(state: HandballState, at: number): { a: string[]; b: string[] } {
  const now = elapsedMs(state, at);
  const left = (list: number[]) =>
    list
      .filter((until) => until > now)
      .sort((x, y) => y - x)
      .map((until) => {
        const seconds = Math.ceil((until - now) / 1000);
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      });
  return { a: left(state.penalties.a), b: left(state.penalties.b) };
}

/**
 * A handball board as the ordinary score designs draw it: the match clock is the clock, the period is the label
 * (unless the operator wrote one), and the suspensions still running come along for the design to show.
 */
export function handballView(state: HandballState, at: number, periodLabel: (period: number) => string): ScoreState & { penalties: { a: string[]; b: string[] } } {
  return {
    a: state.a,
    b: state.b,
    label: state.label || periodLabel(state.period),
    clock: clockText(elapsedMs(state, at)),
    penalties: penaltiesLeft(state, at),
  };
}
