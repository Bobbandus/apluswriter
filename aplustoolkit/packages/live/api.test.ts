import { describe, expect, it } from 'vitest';
import { API_NAMES, actionForName } from './api';
import { BOARD_KINDS } from './types';

describe('button names for HTTP control', () => {
  it('turns a name into the action of that button, for each kind of board', () => {
    expect(actionForName('score', 'a-plus', 0)).toEqual({ type: 'add', side: 'a' });
    expect(actionForName('score', 'B-MINUS', 0)).toEqual({ type: 'sub', side: 'b' });
    expect(actionForName('pingis', 'point-b', 0)).toEqual({ type: 'point', side: 'b' });
    expect(actionForName('pingis', 'next-game', 0)).toEqual({ type: 'nextGame' });
    expect(actionForName('handball', 'clock-start', 1234)).toEqual({ type: 'start', at: 1234 });
    expect(actionForName('handball', 'suspend-a', 99)).toEqual({ type: 'suspend', side: 'a', at: 99 });
    expect(actionForName('handball', 'half-2', 0)).toEqual({ type: 'period', period: 2 });
    expect(actionForName('lower', 'next', 0)).toEqual({ type: 'next' });
  });

  it('counts lower thirds from 1, as the control page does', () => {
    expect(actionForName('lower', 'show-1', 0)).toEqual({ type: 'show', index: 0 });
    expect(actionForName('lower', 'show-12', 0)).toEqual({ type: 'show', index: 11 });
    expect(actionForName('lower', 'show-0', 0)).toBeNull();
  });

  it('does not answer to a button the board does not have', () => {
    expect(actionForName('score', 'clock-start', 0)).toBeNull();
    expect(actionForName('pingis', 'a-plus', 0)).toBeNull();
    expect(actionForName('lower', 'point-a', 0)).toBeNull();
    expect(actionForName('handball', 'reset', 0)).toBeNull();
    expect(actionForName('score', '../etc/passwd', 0)).toBeNull();
    expect(actionForName('score', '', 0)).toBeNull();
  });

  it('lists only names that work, for every kind', () => {
    for (const kind of BOARD_KINDS) {
      for (const name of API_NAMES[kind]) expect(actionForName(kind, name, 0), `${kind}/${name}`).not.toBeNull();
    }
  });
});
