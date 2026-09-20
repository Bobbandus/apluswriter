import { applyHandball, defaultHandball, type HandballAction } from './handball';
import { applyLower, defaultLower, type LowerAction } from './lower';
import { applyPingis, defaultPingis, type PingisAction } from './pingis';
import { applyRanking, defaultRanking, type RankingAction } from './ranking';
import { applyScore, defaultScore, type ScoreAction } from './score';
import type { BoardKind, BoardState, HandballState, LowerState, PingisState, RankingState, ScoreState } from './types';

/**
 * What a board's state is, whatever kind it is. The database holds it as JSON that anyone with the control
 * link could have written, so it is read through `normalizeState`, which never trusts its shape.
 */

export type LiveAction = ScoreAction | PingisAction | HandballAction | RankingAction | LowerAction;

export function defaultState(kind: BoardKind): BoardState {
  return kind === 'pingis' ? defaultPingis() : kind === 'handball' ? defaultHandball() : kind === 'ranking' ? defaultRanking() : kind === 'lower' ? defaultLower() : defaultScore();
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown, fallback: string, max = 120) => (typeof value === 'string' ? value.slice(0, max) : fallback);
const int = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;

function side<T extends { name: string; color: string; logo: string; flag: string }>(raw: unknown, fallback: T): T {
  const source = isObject(raw) ? raw : {};
  return { ...fallback, name: str(source['name'], fallback.name, 40), color: str(source['color'], fallback.color, 64), logo: str(source['logo'], fallback.logo, 300), flag: /^[A-Za-z]{2}$/.test(String(source['flag'])) ? String(source['flag']).toUpperCase() : fallback.flag };
}

/** The state as it should be, from whatever was stored: missing parts take defaults and odd values are set right. */
export function normalizeState(kind: BoardKind, raw: unknown): BoardState {
  const source = isObject(raw) ? raw : {};

  if (kind === 'score' || kind === 'handball') {
    const base = defaultScore();
    const a = { ...side(source['a'], base.a), score: int(isObject(source['a']) ? source['a']['score'] : 0, 0, 0, 999) };
    const b = { ...side(source['b'], base.b), score: int(isObject(source['b']) ? source['b']['score'] : 0, 0, 0, 999) };
    const score = { a, b, label: str(source['label'], '', 60), clock: str(source['clock'], '', 12) } satisfies ScoreState;
    if (kind === 'score') return score;
    const timer = isObject(source['timer']) ? source['timer'] : {};
    const since = typeof timer['since'] === 'number' && Number.isFinite(timer['since']) ? timer['since'] : null;
    const penalties = isObject(source['penalties']) ? source['penalties'] : {};
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(0, 3) : []);
    const rawTimeout = isObject(source['timeout']) ? source['timeout'] : null;
    const timeout =
      rawTimeout && (rawTimeout['side'] === 'a' || rawTimeout['side'] === 'b') && typeof rawTimeout['endsAt'] === 'number' && Number.isFinite(rawTimeout['endsAt'])
        ? { side: rawTimeout['side'] as 'a' | 'b', endsAt: rawTimeout['endsAt'] }
        : null;
    const period = source['period'] === 2 || source['period'] === 3 || source['period'] === 4 ? source['period'] : 1;
    return { ...score, period, timer: { base: int(timer['base'], 0, 0, 4 * 30 * 60 * 1000), since }, penalties: { a: list(penalties['a']), b: list(penalties['b']) }, timeout } satisfies HandballState;
  }

  if (kind === 'pingis') {
    const base = defaultPingis();
    const player = (raw: unknown, fallback: PingisState['a']) => ({
      ...side(raw, fallback),
      points: int(isObject(raw) ? raw['points'] : 0, 0, 0, 99),
      sets: int(isObject(raw) ? raw['sets'] : 0, 0, 0, 9),
    });
    const bestOf = source['bestOf'] === 3 || source['bestOf'] === 7 ? source['bestOf'] : 5;
    const winner = (value: unknown) => (value === 'a' || value === 'b' ? value : null);
    const games = Array.isArray(source['games'])
      ? source['games'].filter(isObject).slice(0, 9).map((game) => ({ a: int(game['a'], 0, 0, 99), b: int(game['b'], 0, 0, 99) }))
      : [];
    return {
      a: player(source['a'], base.a),
      b: player(source['b'], base.b),
      bestOf,
      firstServer: source['firstServer'] === 'b' ? 'b' : 'a',
      server: source['server'] === 'b' ? 'b' : 'a',
      gameWon: winner(source['gameWon']),
      winner: winner(source['winner']),
      games,
      label: str(source['label'], '', 60),
      // Undo steps are the operator's own history; a page that only draws the board never reads them.
      undo: Array.isArray(source['undo']) ? (source['undo'].filter(isObject).slice(-20) as unknown as PingisState['undo']) : [],
    } satisfies PingisState;
  }

  if (kind === 'ranking') {
    const entries = Array.isArray(source['entries'])
      ? source['entries'].filter(isObject).slice(0, 30).map((entry) => ({ name: str(entry['name'], '', 40), points: int(entry['points'], 0, 0, 9999), color: str(entry['color'], '', 64) }))
      : defaultRanking().entries;
    return { title: str(source['title'], '', 60), entries, highlight: int(source['highlight'], -1, -1, Math.max(-1, entries.length - 1)) } satisfies RankingState;
  }

  const items = Array.isArray(source['items'])
    ? source['items'].filter(isObject).slice(0, 200).map((item) => ({ title: str(item['title'], '', 80), subtitle: str(item['subtitle'], '', 120) }))
    : defaultLower().items;
  return {
    items,
    index: int(source['index'], 0, 0, Math.max(0, items.length - 1)),
    visible: source['visible'] === true && items.length > 0,
  } satisfies LowerState;
}

/** Applies an action to a board of the given kind. */
export function applyAction(kind: BoardKind, state: BoardState, action: LiveAction): BoardState {
  if (kind === 'score') return applyScore(state as ScoreState, action as ScoreAction);
  if (kind === 'handball') return applyHandball(state as HandballState, action as HandballAction);
  if (kind === 'ranking') return applyRanking(state as RankingState, action as RankingAction);
  if (kind === 'pingis') return applyPingis(state as PingisState, action as PingisAction);
  return applyLower(state as LowerState, action as LowerAction);
}
