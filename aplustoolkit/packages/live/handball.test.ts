import { describe, expect, it } from 'vitest';
import { applyAction, defaultState, normalizeState } from './board';
import { HALF_MS, SUSPENSION_MS, applyHandball, clockText, defaultHandball, elapsedMs, handballView, penaltiesLeft, type HandballAction } from './handball';
import type { HandballState } from './types';

const SECOND = 1000;
const run = (state: HandballState, ...actions: HandballAction[]) => actions.reduce(applyHandball, state);

describe('handball clock', () => {
  it('counts up from the moment it starts, and holds still when stopped', () => {
    let state = run(defaultHandball(), { type: 'start', at: 10_000 });
    expect(elapsedMs(state, 10_000)).toBe(0);
    expect(elapsedMs(state, 70_000)).toBe(60_000);
    state = run(state, { type: 'stop', at: 70_000 });
    expect(elapsedMs(state, 500_000)).toBe(60_000);
    // Starting again carries on from where it stopped.
    state = run(state, { type: 'start', at: 100_000 });
    expect(elapsedMs(state, 130_000)).toBe(90_000);
  });

  it('ignores start when already running and stop when already stopped', () => {
    const running = run(defaultHandball(), { type: 'start', at: 0 });
    expect(applyHandball(running, { type: 'start', at: 5000 })).toBe(running);
    expect(applyHandball(defaultHandball(), { type: 'stop', at: 5000 })).toEqual(defaultHandball());
  });

  it('can be set and nudged, while running or stopped', () => {
    let state = run(defaultHandball(), { type: 'setClock', ms: 25 * 60 * SECOND, at: 0 });
    expect(elapsedMs(state, 0)).toBe(25 * 60 * SECOND);
    state = run(state, { type: 'start', at: 1000 }, { type: 'adjust', by: -10 * SECOND, at: 11_000 });
    // Ten seconds had passed (25:10), and ten were taken off.
    expect(elapsedMs(state, 11_000)).toBe(25 * 60 * SECOND);
    expect(elapsedMs(state, 21_000)).toBe(25 * 60 * SECOND + 10 * SECOND);
    expect(elapsedMs(run(defaultHandball(), { type: 'adjust', by: -5000, at: 0 }), 0)).toBe(0);
  });

  it('starts the second half stopped at 30:00', () => {
    const state = run(defaultHandball(), { type: 'start', at: 0 }, { type: 'period', period: 2 });
    expect(state.period).toBe(2);
    expect(state.timer).toEqual({ base: HALF_MS, since: null });
  });

  it('writes the clock as mm:ss and lets minutes run past 59', () => {
    expect(clockText(0)).toBe('00:00');
    expect(clockText(65_400)).toBe('01:05');
    expect(clockText(HALF_MS)).toBe('30:00');
    expect(clockText(61 * 60 * SECOND)).toBe('61:00');
  });
});

describe('two-minute suspensions', () => {
  it('run out with the match clock and not before', () => {
    let state = run(defaultHandball(), { type: 'start', at: 0 }, { type: 'suspend', side: 'a', at: 30 * SECOND });
    expect(penaltiesLeft(state, 30 * SECOND).a).toEqual(['2:00']);
    expect(penaltiesLeft(state, 90 * SECOND).a).toEqual(['1:00']);
    expect(penaltiesLeft(state, 30 * SECOND + SUSPENSION_MS).a).toEqual([]);
    // With the clock stopped, the suspension stands still.
    state = run(state, { type: 'stop', at: 60 * SECOND });
    expect(penaltiesLeft(state, 10_000_000).a).toEqual(['1:30']);
  });

  it('allows three at once per side, longest first, and refuses a fourth', () => {
    let state = run(defaultHandball(), { type: 'start', at: 0 });
    state = run(state, { type: 'suspend', side: 'b', at: 0 }, { type: 'suspend', side: 'b', at: 20 * SECOND }, { type: 'suspend', side: 'b', at: 40 * SECOND });
    expect(penaltiesLeft(state, 40 * SECOND).b).toHaveLength(3);
    expect(applyHandball(state, { type: 'suspend', side: 'b', at: 41 * SECOND })).toBe(state);
    expect(penaltiesLeft(state, 40 * SECOND).b[0]).toBe('2:00');
  });

  it('frees a place when one has run out, and can be ended by hand', () => {
    let state = run(defaultHandball(), { type: 'start', at: 0 }, { type: 'suspend', side: 'a', at: 0 }, { type: 'suspend', side: 'a', at: 0 }, { type: 'suspend', side: 'a', at: 0 });
    state = run(state, { type: 'suspend', side: 'a', at: 3 * 60 * SECOND });
    expect(penaltiesLeft(state, 3 * 60 * SECOND).a).toEqual(['2:00']);
    state = run(state, { type: 'endSuspension', side: 'a', index: 0 });
    expect(penaltiesLeft(state, 3 * 60 * SECOND).a).toEqual([]);
  });

  it('goes with its team when the sides are swapped', () => {
    let state = run(defaultHandball(), { type: 'add', side: 'a', by: 3 }, { type: 'suspend', side: 'a', at: 0 });
    state = run(state, { type: 'swap' });
    expect(state.b.score).toBe(3);
    expect(penaltiesLeft(state, 0)).toEqual({ a: [], b: ['2:00'] });
  });
});

describe('handball as a scoreboard', () => {
  it('keeps the score rules: adding, renaming, resetting', () => {
    const state = run(defaultHandball(), { type: 'add', side: 'a' }, { type: 'add', side: 'b', by: 2 }, { type: 'rename', side: 'a', name: 'Höör' });
    expect([state.a.name, state.a.score, state.b.score]).toEqual(['Höör', 1, 2]);
    expect(run(state, { type: 'reset' }).a.score).toBe(0);
  });

  it('is drawn as a score with the clock, the period and the suspensions', () => {
    const state = run(defaultHandball(), { type: 'start', at: 0 }, { type: 'suspend', side: 'b', at: 60 * SECOND });
    const view = handballView(state, 75 * SECOND, (period) => `${period}:a halvlek`);
    expect(view).toMatchObject({ clock: '01:15', label: '1:a halvlek', penalties: { a: [], b: ['1:45'] } });
    expect(handballView({ ...state, label: 'Final' }, 0, () => 'x').label).toBe('Final');
  });

  it('goes through the shared board functions and reads back what it wrote', () => {
    let state = defaultState('handball') as HandballState;
    state = applyAction('handball', state, { type: 'start', at: 1234 }) as HandballState;
    state = applyAction('handball', state, { type: 'suspend', side: 'a', at: 5000 }) as HandballState;
    const back = normalizeState('handball', JSON.parse(JSON.stringify(state)));
    expect(back).toEqual(state);
  });

  it('repairs a stored state that is not what it should be', () => {
    const state = normalizeState('handball', { period: 9, timer: { base: -5, since: 'x' }, penalties: { a: [1, 'q', 3, 4, 5, 6] } }) as HandballState;
    expect(state.period).toBe(1);
    expect(state.timer).toEqual({ base: 0, since: null });
    expect(state.penalties.a).toEqual([1, 3, 4]);
  });
});
