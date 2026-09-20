import { describe, expect, it } from 'vitest';
import { API_NAMES, actionForName } from './api';
import { applyAction, defaultState, normalizeState } from './board';
import { applyRanking, defaultRanking, standings } from './ranking';
import type { RankingState } from './types';

const play = (state: RankingState, ...actions: Parameters<typeof applyRanking>[1][]) => actions.reduce(applyRanking, state);

describe('ranking', () => {
  it('adds points and puts the best first, keeping each entry\'s own place in the list', () => {
    const state = play(defaultRanking(), { type: 'points', index: 2, by: 12 }, { type: 'points', index: 0, by: 8 }, { type: 'points', index: 1, by: 3 });
    expect(standings(state).map((row) => [row.name, row.points, row.place, row.index])).toEqual([
      ['Deltagare 3', 12, 1, 2],
      ['Deltagare 1', 8, 2, 0],
      ['Deltagare 2', 3, 3, 1],
    ]);
  });

  it('lets entries level on points share a place, in the order they were entered', () => {
    const state = play(defaultRanking(), { type: 'points', index: 1, by: 5 }, { type: 'points', index: 2, by: 5 });
    expect(standings(state).map((row) => [row.index, row.place])).toEqual([
      [1, 1],
      [2, 1],
      [0, 3],
    ]);
  });

  it('never lets points go below zero or above the cap', () => {
    const state = play(defaultRanking(), { type: 'points', index: 0, by: -5 }, { type: 'setPoints', index: 1, points: 99999 });
    expect([state.entries[0]!.points, state.entries[1]!.points]).toEqual([0, 9999]);
  });

  it('adds, renames and removes entries, and keeps the highlight on the same entry', () => {
    let state = play(defaultRanking(), { type: 'addEntry', name: '  Ny   artist ' }, { type: 'highlight', index: 2 });
    expect(state.entries[3]!.name).toBe('Ny artist');
    state = play(state, { type: 'removeEntry', index: 0 });
    expect(state.highlight).toBe(1);
    expect(state.entries[state.highlight]!.name).toBe('Deltagare 3');
    state = play(state, { type: 'removeEntry', index: 1 });
    expect(state.highlight).toBe(-1);
    expect(play(state, { type: 'addEntry', name: '   ' })).toBe(state);
    expect(play(state, { type: 'renameEntry', index: 0, name: '' })).toBe(state);
  });

  it('ignores an entry that is not there', () => {
    const state = defaultRanking();
    expect(play(state, { type: 'points', index: 9, by: 1 })).toBe(state);
    expect(play(state, { type: 'highlight', index: 9 })).toBe(state);
    expect(play(state, { type: 'removeEntry', index: -2 })).toBe(state);
  });

  it('clears the points for a new round without losing the names', () => {
    const state = play(defaultRanking(), { type: 'points', index: 0, by: 7 }, { type: 'highlight', index: 0 }, { type: 'resetPoints' });
    expect(state.entries.map((entry) => entry.points)).toEqual([0, 0, 0]);
    expect(state.highlight).toBe(-1);
    expect(state.entries[0]!.name).toBe('Deltagare 1');
  });

  it('goes through the board functions, reads back what it wrote and repairs what it did not', () => {
    let state = defaultState('ranking');
    state = applyAction('ranking', state, { type: 'points', index: 1, by: 4 });
    expect(normalizeState('ranking', JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(normalizeState('ranking', { entries: [{ name: 5, points: 'x' }, 3], highlight: 9 })).toEqual({ title: '', entries: [{ name: '', points: 0, color: '' }], highlight: 0 });
  });

  it('answers to its HTTP button names', () => {
    expect(actionForName('ranking', 'highlight-2', 0)).toEqual({ type: 'highlight', index: 1 });
    expect(actionForName('ranking', 'highlight-none', 0)).toEqual({ type: 'highlight', index: -1 });
    expect(actionForName('ranking', 'reset-points', 0)).toEqual({ type: 'resetPoints' });
    expect(actionForName('ranking', 'highlight-0', 0)).toBeNull();
    for (const name of API_NAMES.ranking) expect(actionForName('ranking', name, 0)).not.toBeNull();
  });
});
