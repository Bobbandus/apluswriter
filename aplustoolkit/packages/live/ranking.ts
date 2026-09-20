import type { RankingState } from './types';

/**
 * A ranking: a list of names with points, drawn best first with a bar for each. It is what a song contest's jury
 * round looks like, and a leaderboard of any kind. The list itself is kept in the order it was entered; the
 * drawing sorts it, so an entry keeps its identity (and its own button on the control page) while it moves up
 * and down the table.
 */

export const defaultRanking = (): RankingState => ({
  title: 'Poäng',
  entries: [
    { name: 'Deltagare 1', points: 0, color: '' },
    { name: 'Deltagare 2', points: 0, color: '' },
    { name: 'Deltagare 3', points: 0, color: '' },
  ],
  highlight: -1,
});

export type RankingAction =
  | { type: 'addEntry'; name: string }
  | { type: 'removeEntry'; index: number }
  | { type: 'renameEntry'; index: number; name: string }
  | { type: 'points'; index: number; by: number }
  | { type: 'setPoints'; index: number; points: number }
  | { type: 'highlight'; index: number }
  | { type: 'title'; text: string }
  | { type: 'resetPoints' };

const MAX_ENTRIES = 30;
const MAX_POINTS = 9999;
const clean = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);
const inRange = (state: RankingState, index: number) => Number.isInteger(index) && index >= 0 && index < state.entries.length;
const clamp = (n: number) => Math.max(0, Math.min(MAX_POINTS, Math.trunc(Number.isFinite(n) ? n : 0)));

const withEntry = (state: RankingState, index: number, change: (points: number) => number): RankingState =>
  inRange(state, index) ? { ...state, entries: state.entries.map((entry, i) => (i === index ? { ...entry, points: clamp(change(entry.points)) } : entry)) } : state;

export function applyRanking(state: RankingState, action: RankingAction): RankingState {
  switch (action.type) {
    case 'addEntry': {
      const name = clean(action.name, 40);
      return name && state.entries.length < MAX_ENTRIES ? { ...state, entries: [...state.entries, { name, points: 0, color: '' }] } : state;
    }
    case 'removeEntry': {
      if (!inRange(state, action.index)) return state;
      // What is highlighted stays the same entry when an earlier one goes, and is dropped when it is the one removed.
      const highlight = state.highlight === action.index ? -1 : state.highlight > action.index ? state.highlight - 1 : state.highlight;
      return { ...state, entries: state.entries.filter((_, i) => i !== action.index), highlight };
    }
    case 'renameEntry': {
      const name = clean(action.name, 40);
      return inRange(state, action.index) && name ? { ...state, entries: state.entries.map((entry, i) => (i === action.index ? { ...entry, name } : entry)) } : state;
    }
    case 'points':
      return withEntry(state, action.index, (points) => points + action.by);
    case 'setPoints':
      return withEntry(state, action.index, () => action.points);
    case 'highlight':
      return action.index === -1 || inRange(state, action.index) ? { ...state, highlight: action.index } : state;
    case 'title':
      return { ...state, title: clean(action.text, 60) };
    case 'resetPoints':
      return { ...state, entries: state.entries.map((entry) => ({ ...entry, points: 0 })), highlight: -1 };
    default:
      return state;
  }
}

export interface Standing {
  /** Where the entry is in the list as entered, which is what its buttons refer to. */
  index: number;
  name: string;
  points: number;
  color: string;
  /** 1 for the leader. Entries level on points share a place. */
  place: number;
}

/** The entries best first. Ties share a place and keep the order they were entered in. */
export function standings(state: RankingState): Standing[] {
  const ordered = state.entries.map((entry, index) => ({ ...entry, index })).sort((a, b) => b.points - a.points || a.index - b.index);
  const result: Standing[] = [];
  ordered.forEach((entry, position) => {
    const previous = result[position - 1];
    result.push({ ...entry, place: previous && previous.points === entry.points ? previous.place : position + 1 });
  });
  return result;
}
