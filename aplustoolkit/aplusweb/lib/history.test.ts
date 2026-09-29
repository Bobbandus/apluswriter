import { describe, expect, it } from 'vitest';
import { GROUP_WINDOW, LIMIT, emptyHistory, record, redo, undo } from './history';

describe('undo history', () => {
  it('undoes and redoes whole values', () => {
    let h = record(emptyHistory<number>(), 1, null, 0);
    h = record(h, 2, null, 10);
    const back = undo(h, 3);
    expect(back?.value).toBe(2);
    const again = redo(back!.history, 2);
    expect(again?.value).toBe(3);
  });

  it('gathers typing in one field into one step', () => {
    let h = emptyHistory<string>();
    h = record(h, '', 'desc', 0);
    h = record(h, 'H', 'desc', 100);
    h = record(h, 'He', 'desc', 200);
    expect(h.past).toEqual(['']);
    expect(undo(h, 'Hej')?.value).toBe('');
  });

  it('starts a new step after a pause or in another field', () => {
    let h = record(emptyHistory<string>(), 'a', 'x', 0);
    h = record(h, 'b', 'x', GROUP_WINDOW + 1);
    h = record(h, 'c', 'y', GROUP_WINDOW + 2);
    expect(h.past).toEqual(['a', 'b', 'c']);
  });

  it('forgets the redo branch on a new edit', () => {
    const h = record(emptyHistory<number>(), 1, null, 0);
    const back = undo(h, 2)!;
    expect(record(back.history, 1, null, 5).future).toEqual([]);
  });

  it('keeps a bounded number of steps and does nothing at the ends', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < LIMIT + 20; i += 1) h = record(h, i, null, i);
    expect(h.past).toHaveLength(LIMIT);
    expect(undo(emptyHistory<number>(), 1)).toBeNull();
    expect(redo(emptyHistory<number>(), 1)).toBeNull();
  });
});
