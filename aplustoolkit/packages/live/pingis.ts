import { other, type PingisSnapshot, type PingisState, type Side } from './types';

/**
 * Table tennis, by the ITTF rules that a scoreboard has to know:
 *  - a game goes to 11 and is won by two;
 *  - the serve changes every two points, and from 10–10 it changes every point;
 *  - the player who served first in a game receives first in the next;
 *  - a match is the best of 3, 5 or 7 games.
 */

const GAME_POINTS = 11;
const UNDO_STEPS = 20;

export const defaultPingis = (): PingisState => ({
  a: { name: 'Spelare A', color: '', logo: '', flag: '', points: 0, sets: 0 },
  b: { name: 'Spelare B', color: '', logo: '', flag: '', points: 0, sets: 0 },
  bestOf: 5,
  firstServer: 'a',
  server: 'a',
  gameWon: null,
  winner: null,
  games: [],
  label: '',
  undo: [],
});

/** Who serves when `a` and `b` points have been played and `first` served first. */
export function serverAt(first: Side, a: number, b: number): Side {
  const total = a + b;
  // Every two points until 10–10, then every point.
  const changes = total < 20 ? Math.floor(total / 2) : 10 + (total - 20);
  return changes % 2 === 0 ? first : other(first);
}

/** Whether a game with these points is over, and who won it. */
export function gameWinner(a: number, b: number): Side | null {
  if (a >= GAME_POINTS && a - b >= 2) return 'a';
  if (b >= GAME_POINTS && b - a >= 2) return 'b';
  return null;
}

export const gamesToWin = (bestOf: 3 | 5 | 7) => Math.ceil(bestOf / 2);

export type PingisAction =
  | { type: 'point'; side: Side }
  | { type: 'undo' }
  | { type: 'nextGame' }
  | { type: 'setServer'; side: Side }
  | { type: 'bestOf'; games: 3 | 5 | 7 }
  | { type: 'reset' }
  | { type: 'rename'; side: Side; name: string }
  | { type: 'label'; text: string };

const snapshot = ({ undo: _undo, ...rest }: PingisState): PingisSnapshot => rest;
const remember = (state: PingisState): PingisSnapshot[] => [...state.undo, snapshot(state)].slice(-UNDO_STEPS);
const text = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

export function applyPingis(state: PingisState, action: PingisAction): PingisState {
  switch (action.type) {
    case 'point': {
      // A finished game or match takes no more points; the operator moves on with "next game" or undoes.
      if (state.gameWon || state.winner) return state;
      const next = {
        ...state,
        [action.side]: { ...state[action.side], points: state[action.side].points + 1 },
        undo: remember(state),
      } as PingisState;
      const won = gameWinner(next.a.points, next.b.points);
      if (!won) return { ...next, server: serverAt(next.firstServer, next.a.points, next.b.points) };

      const winner = { ...next[won], sets: next[won].sets + 1 };
      const updated = { ...next, [won]: winner, gameWon: won, games: [...next.games, { a: next.a.points, b: next.b.points }] } as PingisState;
      return { ...updated, winner: winner.sets >= gamesToWin(state.bestOf) ? won : null };
    }

    case 'nextGame': {
      if (!state.gameWon || state.winner) return state;
      const first = other(state.firstServer);
      return {
        ...state,
        a: { ...state.a, points: 0 },
        b: { ...state.b, points: 0 },
        firstServer: first,
        server: first,
        gameWon: null,
        undo: remember(state),
      };
    }

    case 'undo': {
      const previous = state.undo[state.undo.length - 1];
      return previous ? { ...previous, undo: state.undo.slice(0, -1) } : state;
    }

    case 'setServer':
      return { ...state, firstServer: action.side, server: serverAt(action.side, state.a.points, state.b.points), undo: remember(state) };

    case 'bestOf': {
      const winner = state.a.sets >= gamesToWin(action.games) ? 'a' : state.b.sets >= gamesToWin(action.games) ? 'b' : null;
      return { ...state, bestOf: action.games, winner };
    }

    case 'reset':
      return { ...defaultPingis(), a: { ...defaultPingis().a, name: state.a.name, color: state.a.color, logo: state.a.logo, flag: state.a.flag }, b: { ...defaultPingis().b, name: state.b.name, color: state.b.color, logo: state.b.logo, flag: state.b.flag }, bestOf: state.bestOf, label: state.label };

    case 'rename':
      return { ...state, [action.side]: { ...state[action.side], name: text(action.name, 40) } };

    case 'label':
      return { ...state, label: text(action.text, 60) };

    default:
      return state;
  }
}
