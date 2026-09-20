import { describe, expect, it } from 'vitest';
import { applyLower, defaultLower } from './lower';
import { applyPingis, defaultPingis, gameWinner, gamesToWin, serverAt } from './pingis';
import { applyScore, defaultScore } from './score';
import { DEFAULT_THEMES, DESIGNS, THEME_FORMAT, isColor, themeToCss, validateTheme } from './theme';
import type { PingisState, Side } from './types';

describe('score', () => {
  it('adds and subtracts, and never goes below zero', () => {
    let state = defaultScore();
    state = applyScore(state, { type: 'add', side: 'a' });
    state = applyScore(state, { type: 'add', side: 'a', by: 2 });
    state = applyScore(state, { type: 'sub', side: 'b' });
    expect([state.a.score, state.b.score]).toEqual([3, 0]);
  });

  it('swaps everything about the sides, so a name never keeps the wrong score', () => {
    let state = applyScore(defaultScore(), { type: 'rename', side: 'a', name: 'Lag Ett' });
    state = applyScore(state, { type: 'add', side: 'a', by: 4 });
    state = applyScore(state, { type: 'swap' });
    expect(state.b).toMatchObject({ name: 'Lag Ett', score: 4 });
    expect(state.a.score).toBe(0);
  });

  it('resets the score but keeps the names, and tidies text', () => {
    let state = applyScore(defaultScore(), { type: 'rename', side: 'b', name: '  Lag   Två  ' });
    state = applyScore(state, { type: 'add', side: 'b', by: 5 });
    state = applyScore(state, { type: 'reset' });
    expect(state.b).toMatchObject({ name: 'Lag Två', score: 0 });
  });

  it('is a pure function: the old state is not touched', () => {
    const before = defaultScore();
    applyScore(before, { type: 'add', side: 'a' });
    expect(before.a.score).toBe(0);
  });
});

describe('table tennis', () => {
  const play = (state: PingisState, points: Side[]) => points.reduce((s, side) => applyPingis(s, { type: 'point', side }), state);
  const times = (side: Side, n: number): Side[] => Array.from({ length: n }, () => side);

  it('serves two points each, and every point from 10-10', () => {
    expect(serverAt('a', 0, 0)).toBe('a');
    expect(serverAt('a', 1, 0)).toBe('a');
    expect(serverAt('a', 1, 1)).toBe('b');
    expect(serverAt('a', 2, 2)).toBe('a');
    expect(serverAt('a', 10, 9)).toBe('b');
    expect(serverAt('a', 10, 10)).toBe('a');
    expect(serverAt('a', 11, 10)).toBe('b');
    expect(serverAt('a', 11, 11)).toBe('a');
    expect(serverAt('b', 0, 0)).toBe('b');
  });

  it('wins a game at 11 with a lead of two, not before', () => {
    expect(gameWinner(11, 9)).toBe('a');
    expect(gameWinner(11, 10)).toBeNull();
    expect(gameWinner(10, 12)).toBe('b');
    expect(gameWinner(12, 10)).toBe('a');
    expect(gameWinner(10, 10)).toBeNull();
  });

  it('plays a game to the end, keeps the score on show, and awards the set', () => {
    const state = play(defaultPingis(), times('a', 11));
    expect(state).toMatchObject({ gameWon: 'a', winner: null });
    expect([state.a.points, state.a.sets, state.b.sets]).toEqual([11, 1, 0]);
    expect(state.games).toEqual([{ a: 11, b: 0 }]);
    // No more points until the next game.
    expect(applyPingis(state, { type: 'point', side: 'b' })).toBe(state);
  });

  it('goes to deuce and needs two clear points', () => {
    let state = play(defaultPingis(), [...times('a', 10), ...times('b', 10)]);
    expect(state.gameWon).toBeNull();
    state = play(state, ['a']);
    expect(state.gameWon).toBeNull();
    state = play(state, ['b']);
    state = play(state, ['b', 'b']);
    expect(state).toMatchObject({ gameWon: 'b' });
    expect([state.a.points, state.b.points]).toEqual([11, 13]);
  });

  it('starts the next game at 0-0 with the other player serving first', () => {
    let state = play(defaultPingis(), times('a', 11));
    state = applyPingis(state, { type: 'nextGame' });
    expect(state).toMatchObject({ gameWon: null, firstServer: 'b', server: 'b' });
    expect([state.a.points, state.b.points, state.a.sets]).toEqual([0, 0, 1]);
    // The serve then changes every second point.
    state = play(state, ['a', 'a']);
    expect(state.server).toBe('a');
  });

  it('ends the match at the games needed, best of 5 by default', () => {
    expect(gamesToWin(3)).toBe(2);
    expect(gamesToWin(5)).toBe(3);
    expect(gamesToWin(7)).toBe(4);
    let state = defaultPingis();
    for (let game = 0; game < 3; game += 1) {
      state = play(state, times('a', 11));
      if (state.winner === null) state = applyPingis(state, { type: 'nextGame' });
    }
    expect(state.winner).toBe('a');
    expect(state.a.sets).toBe(3);
    expect(applyPingis(state, { type: 'nextGame' })).toBe(state);
  });

  it('undoes a point, a finished game and a next game, one step at a time', () => {
    let state = play(defaultPingis(), times('a', 11));
    state = applyPingis(state, { type: 'nextGame' });
    state = applyPingis(state, { type: 'undo' });
    expect([state.gameWon, state.a.points, state.a.sets]).toEqual(['a', 11, 1]);
    state = applyPingis(state, { type: 'undo' });
    expect([state.gameWon, state.a.points, state.a.sets, state.games]).toEqual([null, 10, 0, []]);
    expect(applyPingis(defaultPingis(), { type: 'undo' })).toEqual(defaultPingis());
  });

  it('keeps only the last steps for undo, so the state stays small', () => {
    const state = play(defaultPingis(), times('a', 10).concat(times('b', 10)));
    expect(state.undo.length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(state).length).toBeLessThan(8000);
  });

  it('resets the match but keeps names and the format', () => {
    let state = applyPingis(defaultPingis(), { type: 'rename', side: 'a', name: 'Kim' });
    state = applyPingis(state, { type: 'bestOf', games: 7 });
    state = applyPingis(play(state, times('a', 11)), { type: 'reset' });
    expect(state).toMatchObject({ bestOf: 7, gameWon: null, winner: null, games: [] });
    expect(state.a).toMatchObject({ name: 'Kim', points: 0, sets: 0 });
  });

  it('lets the operator set who serves first, and the serve follows from there', () => {
    let state = applyPingis(defaultPingis(), { type: 'setServer', side: 'b' });
    expect(state.server).toBe('b');
    state = play(state, ['a', 'a']);
    expect(state.server).toBe('a');
  });
});

describe('lower thirds', () => {
  const three = () => {
    let state = defaultLower();
    state = applyLower(state, { type: 'update', index: 0, item: { title: 'Ett', subtitle: 'a' } });
    state = applyLower(state, { type: 'add', item: { title: 'Två', subtitle: 'b' } });
    return applyLower(state, { type: 'add', item: { title: 'Tre', subtitle: 'c' } });
  };

  it('shows, hides and steps through the queue, stopping at the ends', () => {
    let state = three();
    state = applyLower(state, { type: 'show' });
    expect(state).toMatchObject({ index: 0, visible: true });
    state = applyLower(state, { type: 'next' });
    state = applyLower(state, { type: 'next' });
    expect(state.index).toBe(2);
    expect(applyLower(state, { type: 'next' })).toBe(state);
    state = applyLower(state, { type: 'hide' });
    expect(state.visible).toBe(false);
    expect(applyLower(applyLower(state, { type: 'show', index: 0 }), { type: 'prev' }).index).toBe(0);
  });

  it('shows a chosen item and ignores one that is not there', () => {
    const state = three();
    expect(applyLower(state, { type: 'show', index: 1 })).toMatchObject({ index: 1, visible: true });
    expect(applyLower(state, { type: 'show', index: 9 })).toBe(state);
  });

  it('takes an item off the air when it is removed, and keeps the same one up when an earlier one goes', () => {
    let state = applyLower(three(), { type: 'show', index: 1 });
    expect(applyLower(state, { type: 'remove', index: 1 })).toMatchObject({ visible: false, index: 1 });
    state = applyLower(state, { type: 'remove', index: 0 });
    expect(state).toMatchObject({ visible: true, index: 0 });
    expect(state.items[state.index]?.title).toBe('Två');
  });

  it('tidies and limits what is typed', () => {
    const state = applyLower(defaultLower(), { type: 'add', item: { title: `  A   ${'b'.repeat(200)}`, subtitle: ' x ' } });
    const item = state.items[1]!;
    expect(item.title.length).toBeLessThanOrEqual(80);
    expect(item.title.startsWith('A b')).toBe(true);
    expect(item.subtitle).toBe('x');
  });
});

describe('themes', () => {
  it('accepts every built-in theme and turns it into CSS', () => {
    for (const theme of DEFAULT_THEMES) {
      const result = validateTheme(theme);
      expect(result, theme.name).toEqual({ ok: true, theme });
      const css = themeToCss(theme);
      expect(css['--lv-primary'], theme.name).toBe(theme.primary);
      expect(css['--lv-font']).toBe(`var(--font-live-${theme.font})`);
      expect(css['--lv-backdrop']).toMatch(/^linear-gradient\(\d+deg, /);
    }
  });

  it('has one built-in theme per design, with distinct names, drawn after real broadcast graphics', () => {
    expect(new Set(DEFAULT_THEMES.map((theme) => theme.design))).toEqual(new Set(DESIGNS));
    expect(new Set(DEFAULT_THEMES.map((theme) => theme.name)).size).toBe(DEFAULT_THEMES.length);
  });

  it('fills in what is left out from the default', () => {
    const result = validateTheme({ name: 'Bara namn' });
    expect(result.ok && result.theme.name).toBe('Bara namn');
    expect(result.ok && result.theme.design).toBe(DEFAULT_THEMES[0]!.design);
  });

  it('reports every problem at once, with the value that was wrong', () => {
    const result = validateTheme({ font: 'comic', radius: 400, text: 'red; background: url(//evil)', background: { stops: ['#fff'] } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(4);
      expect(result.errors.join(' ')).toContain('comic');
      expect(result.errors.join(' ')).toContain('400');
    }
  });

  it('lets no colour carry anything but a colour', () => {
    for (const bad of ['red; x:y', 'url(http://x)', 'expression(1)', '#12', 'rgb(1,2,3);}', 'javascript:1', '', 42, null]) expect(isColor(bad), String(bad)).toBe(false);
    for (const good of ['#fff', '#1a2b3c', '#1a2b3c80', 'rgba(20, 30, 40, 0.8)', 'hsl(210, 80%, 50%)', 'rgb(0 0 0 / 50%)', 'transparent']) expect(isColor(good), good).toBe(true);
  });

  it('is not fooled by a theme that is not an object, and rejects a design it does not know', () => {
    for (const bad of [null, 'text', 3, [1, 2]]) expect(validateTheme(bad).ok).toBe(false);
    expect(validateTheme({ design: 'hologram' }).ok).toBe(false);
  });

  it('describes the format it accepts, and names every design', () => {
    expect(THEME_FORMAT).toContain('secondary');
    for (const design of DESIGNS) expect(THEME_FORMAT).toContain(design);
  });
});

import { applyAction, defaultState, normalizeState } from './board';

describe('board state read from storage', () => {
  it('gives a default for empty or nonsense state, whatever the kind', () => {
    for (const kind of ['score', 'pingis', 'lower'] as const) {
      expect(normalizeState(kind, {})).toEqual(defaultState(kind));
      expect(normalizeState(kind, null)).toEqual(defaultState(kind));
      expect(normalizeState(kind, 'nonsense')).toEqual(defaultState(kind));
    }
  });

  it('keeps what is valid, and sets right what is not', () => {
    const score = normalizeState('score', { a: { name: 'X', score: 12.7 }, b: { score: -3 }, label: 5 });
    expect(score).toMatchObject({ a: { name: 'X', score: 12 }, b: { score: 0 }, label: '' });
    const pingis = normalizeState('pingis', { bestOf: 9, a: { points: 500 }, server: 'q', gameWon: 'z' });
    expect(pingis).toMatchObject({ bestOf: 5, server: 'a', gameWon: null });
    expect((pingis as { a: { points: number } }).a.points).toBe(99);
    const lower = normalizeState('lower', { items: [{ title: 'A' }, 7], index: 4, visible: true });
    expect(lower).toMatchObject({ items: [{ title: 'A', subtitle: '' }], index: 0, visible: true });
  });

  it('reads back what an action wrote', () => {
    let state = defaultState('pingis');
    for (let i = 0; i < 5; i += 1) state = applyAction('pingis', state, { type: 'point', side: 'a' });
    expect(normalizeState('pingis', JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
