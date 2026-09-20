import type { ScoreState, Side } from './types';

export const defaultScore = (): ScoreState => ({
  a: { name: 'Hemma', color: '', logo: '', flag: '', score: 0 },
  b: { name: 'Borta', color: '', logo: '', flag: '', score: 0 },
  label: '',
  clock: '',
});

export type ScoreAction =
  | { type: 'add'; side: Side; by?: number }
  | { type: 'sub'; side: Side; by?: number }
  | { type: 'set'; side: Side; score: number }
  | { type: 'reset' }
  | { type: 'swap' }
  | { type: 'rename'; side: Side; name: string }
  | { type: 'label'; text: string }
  | { type: 'clock'; text: string };

const MAX = 999;
const clamp = (n: number) => Math.max(0, Math.min(MAX, Math.trunc(Number.isFinite(n) ? n : 0)));
const text = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

/** A simple two-sided scoreboard. Scores never go below zero. */
export function applyScore(state: ScoreState, action: ScoreAction): ScoreState {
  switch (action.type) {
    case 'add':
      return { ...state, [action.side]: { ...state[action.side], score: clamp(state[action.side].score + (action.by ?? 1)) } };
    case 'sub':
      return { ...state, [action.side]: { ...state[action.side], score: clamp(state[action.side].score - (action.by ?? 1)) } };
    case 'set':
      return { ...state, [action.side]: { ...state[action.side], score: clamp(action.score) } };
    case 'reset':
      return { ...state, a: { ...state.a, score: 0 }, b: { ...state.b, score: 0 } };
    // Swapping the sides swaps everything about them, so a name never stays behind with the wrong score.
    case 'swap':
      return { ...state, a: state.b, b: state.a };
    case 'rename':
      return { ...state, [action.side]: { ...state[action.side], name: text(action.name, 40) } };
    case 'label':
      return { ...state, label: text(action.text, 60) };
    case 'clock':
      return { ...state, clock: text(action.text, 12) };
    default:
      return state;
  }
}
