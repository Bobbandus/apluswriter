import { describe, expect, it } from 'vitest';
import { parse } from '../fountain/parse';
import {
  addDay,
  castNumbers,
  dayDate,
  draftSchedule,
  emptyBoard,
  lightOf,
  moveDay,
  moveStrip,
  readBoard,
  refOf,
  refreshRefs,
  removeDay,
  removeMissing,
  resolveBoard,
  schedule,
  settingOf,
  stripboardCsv,
  stripColor,
  summariseDay,
  unschedule,
  type Stripboard,
} from './stripboard';

const SCRIPT = [
  'INT. KÖK - DAG',
  '',
  'VILDE',
  'Hej.',
  '',
  'EXT. SKOLGÅRD - NATT',
  '',
  'NOA',
  'Vem där?',
  '',
  'VILDE',
  'Jag.',
  '',
  'INT. KÖK - DAG',
  '',
  'Tomt.',
  '',
  'EXT. SKOLGÅRD - DAG',
  '',
  'VILDE',
  'Igen.',
].join('\n');

const script = parse(SCRIPT);
const scenes = script.scenes;
const ids = () => {
  let n = 0;
  return () => `day${++n}`;
};

const board = (...days: number[][]): Stripboard => ({
  ...emptyBoard(),
  days: days.map((list, i) => ({ id: `d${i}`, strips: list.map((index) => refOf(scenes, index)) })),
});

describe('reading a stored board', () => {
  it('opens anything as a board and never throws', () => {
    for (const junk of [null, 42, 'x', [], { days: 'no' }, { days: [null, { strips: [{ index: 'a' }] }] }]) {
      expect(() => readBoard(junk)).not.toThrow();
    }
    expect(readBoard(null).days).toEqual([]);
  });

  it('keeps valid days and strips and repairs duplicate day ids', () => {
    const read = readBoard({
      days: [
        { id: 'a', strips: [{ index: 0, heading: 'INT. KÖK - DAG' }, { nope: true }], note: 'Hela teamet' },
        { id: 'a', strips: [] },
      ],
      startDate: '2026-10-05',
      targetEighths: 40,
    });
    expect(read.days[0]).toEqual({ id: 'a', strips: [{ index: 0, heading: 'INT. KÖK - DAG' }], note: 'Hela teamet' });
    expect(read.days[1]?.id).not.toBe('a');
    expect(read.startDate).toBe('2026-10-05');
    expect(read.targetEighths).toBe(40);
  });

  it('refuses a malformed date rather than showing nonsense dates', () => {
    expect(readBoard({ startDate: '5 okt' }).startDate).toBeNull();
  });
});

describe('finding each strip its scene', () => {
  it('keeps two scenes with the same heading as two strips', () => {
    const resolved = resolveBoard(scenes, board([0, 2]));
    expect(resolved.days[0]?.strips.map((s) => s.scene)).toEqual([0, 2]);
    expect(resolved.unscheduled).toEqual([1, 3]);
  });

  it('follows a scene that moved when a scene was added above it', () => {
    const stored = board([1]);
    const moved = parse(`INT. HALL - DAG\n\nNy.\n\n${SCRIPT}`);
    const resolved = resolveBoard(moved.scenes, stored);
    expect(resolved.days[0]?.strips[0]?.scene).toBe(2);
    expect(moved.scenes[2]?.heading).toBe('EXT. SKOLGÅRD - NATT');
  });

  it('follows an [[id:]] through a rewritten heading', () => {
    const withId = parse('INT. KÖK - DAG\n[[id: s_kok]]\n\nHej.');
    const stored: Stripboard = { ...emptyBoard(), days: [{ id: 'd', strips: [refOf(withId.scenes, 0)] }] };
    expect(stored.days[0]?.strips[0]?.sceneId).toBe('s_kok');
    const renamed = parse('INT. STORA KÖKET - KVÄLL\n[[id: s_kok]]\n\nHej.');
    expect(resolveBoard(renamed.scenes, stored).days[0]?.strips[0]?.scene).toBe(0);
  });

  it('shows a strip whose scene is gone as missing instead of dropping it', () => {
    const stored = board([1]);
    const without = parse('INT. KÖK - DAG\n\nHej.');
    const resolved = resolveBoard(without.scenes, stored);
    expect(resolved.days[0]?.strips).toEqual([{ ref: stored.days[0]?.strips[0], scene: null }]);
    expect(removeMissing(without.scenes, stored).days[0]?.strips).toEqual([]);
  });

  it('gives one scene to one strip only', () => {
    const doubled: Stripboard = { ...emptyBoard(), days: [{ id: 'd', strips: [refOf(scenes, 1), refOf(scenes, 1)] }] };
    const resolved = resolveBoard(scenes, doubled);
    expect(resolved.days[0]?.strips.map((s) => s.scene)).toEqual([1, null]);
  });

  it('brings refs up to date and returns the same object when nothing changed', () => {
    const stored = board([1]);
    expect(refreshRefs(scenes, stored)).toBe(stored);
    const moved = parse(`INT. HALL - DAG\n\nNy.\n\n${SCRIPT}`);
    expect(refreshRefs(moved.scenes, stored).days[0]?.strips[0]?.index).toBe(2);
  });
});

describe('changing the board', () => {
  it('moves a strip down within a day to where it was dropped', () => {
    const next = moveStrip(board([0, 1, 2]), { day: 0, strip: 0 }, { day: 0, strip: 3 });
    expect(next.days[0]?.strips.map((s) => s.index)).toEqual([1, 2, 0]);
  });

  it('moves a strip up within a day', () => {
    const next = moveStrip(board([0, 1, 2]), { day: 0, strip: 2 }, { day: 0, strip: 0 });
    expect(next.days[0]?.strips.map((s) => s.index)).toEqual([2, 0, 1]);
  });

  it('moves a strip to another day', () => {
    const next = moveStrip(board([0, 1], [2]), { day: 0, strip: 1 }, { day: 1, strip: 0 });
    expect(next.days.map((d) => d.strips.map((s) => s.index))).toEqual([[0], [1, 2]]);
  });

  it('leaves the board alone for a move onto itself', () => {
    const b = board([0, 1]);
    expect(moveStrip(b, { day: 0, strip: 0 }, { day: 0, strip: 1 })).toBe(b);
    expect(moveStrip(b, { day: 0, strip: 0 }, { day: 0, strip: 0 })).toBe(b);
  });

  it('schedules and unschedules scenes', () => {
    const b = schedule(board([0]), refOf(scenes, 3), { day: 0, strip: 0 });
    expect(b.days[0]?.strips.map((s) => s.index)).toEqual([3, 0]);
    expect(resolveBoard(scenes, unschedule(b, { day: 0, strip: 0 })).unscheduled).toEqual([1, 2, 3]);
  });

  it('adds, moves and removes days; a removed day puts its scenes back', () => {
    let b = addDay(board([0]), 0, 'new');
    expect(b.days.map((d) => d.id)).toEqual(['new', 'd0']);
    b = moveDay(b, 0, 1);
    expect(b.days.map((d) => d.id)).toEqual(['d0', 'new']);
    b = removeDay(b, 0);
    expect(resolveBoard(scenes, b).unscheduled).toEqual([0, 1, 2, 3]);
  });
});

describe('what a strip is', () => {
  it('reads inside, outside and both', () => {
    expect(settingOf({ prefix: 'INT', heading: 'INT. KÖK' })).toBe('INT');
    expect(settingOf({ prefix: 'EXT', heading: 'EXT. GÅRD' })).toBe('EXT');
    expect(settingOf({ prefix: 'INT./EXT', heading: 'INT./EXT. BIL' })).toBe('INT/EXT');
    expect(settingOf({ prefix: 'I/E', heading: 'I/E. BIL' })).toBe('INT/EXT');
    expect(settingOf({ prefix: null, heading: '.MONTAGE' })).toBeNull();
  });

  it('knows day from night and admits when it cannot tell', () => {
    expect(lightOf({ timeOfDay: 'NATT' })).toBe('night');
    expect(lightOf({ timeOfDay: 'MORGON' })).toBe('day');
    expect(lightOf({ timeOfDay: 'SENARE' })).toBeNull();
  });

  it('colours strips by the stripboard convention', () => {
    expect(scenes.map(stripColor)).toEqual(['intDay', 'extNight', 'intDay', 'extDay']);
    expect(stripColor({ prefix: 'INT', heading: 'INT. X', timeOfDay: 'NIGHT' })).toBe('intNight');
  });

  it('numbers the cast by how many scenes they are in', () => {
    const numbers = castNumbers(script);
    expect(numbers.get('VILDE')).toBe(1);
    expect(numbers.get('NOA')).toBe(2);
  });
});

describe('a day summed up', () => {
  it('adds up eighths, locations and cast, and spots night before day', () => {
    const resolved = resolveBoard(scenes, board([1, 3, 0]));
    const summary = summariseDay(scenes, [4, 8, 2, 3], resolved.days[0]?.strips ?? []);
    expect(summary.eighths).toBe(8 + 3 + 4);
    expect(summary.locations).toEqual(['SKOLGÅRD', 'KÖK']);
    expect(summary.cast).toEqual(['NOA', 'VILDE']);
    expect(summary.nightThenDay).toBe(true);
  });

  it('counts missing strips without their length', () => {
    const summary = summariseDay(scenes, [4], [{ ref: { index: 9, heading: 'X' }, scene: null }]);
    expect(summary).toMatchObject({ scenes: 0, missing: 1, eighths: 0 });
  });
});

describe('dates', () => {
  it('counts forward from the first day', () => {
    expect(dayDate('2026-10-05', 0)).toBe('2026-10-05');
    expect(dayDate('2026-10-05', 6)).toBe('2026-10-11');
  });

  it('skips weekends when asked, including a start on a Saturday', () => {
    // 2026-10-09 is a Friday.
    expect(dayDate('2026-10-09', 1, true)).toBe('2026-10-12');
    expect(dayDate('2026-10-10', 0, true)).toBe('2026-10-12');
  });

  it('has no date without a start', () => {
    expect(dayDate(null, 3)).toBeNull();
    expect(dayDate('nope', 0)).toBeNull();
  });

  it('is not moved by a daylight-saving change', () => {
    // Sweden goes back to winter time on 2026-10-25.
    expect(dayDate('2026-10-24', 1)).toBe('2026-10-25');
    expect(dayDate('2026-10-24', 2)).toBe('2026-10-26');
  });
});

describe('a first draft', () => {
  it('groups by location, day before night, and never touches planned days', () => {
    const planned = board([3]);
    const draft = draftSchedule(scenes, [4, 4, 4, 4], planned, ids());
    expect(draft.days[0]).toEqual(planned.days[0]);
    const laid = draft.days.slice(1).map((d) => d.strips.map((s) => s.index));
    // KÖK first (it appears first), both day scenes; then SKOLGÅRD's night scene.
    expect(laid.flat()).toEqual([0, 2, 1]);
  });

  it('closes a day at the target', () => {
    const b = { ...emptyBoard(), targetEighths: 8 };
    const draft = draftSchedule(scenes, [6, 6, 6, 6], b, ids());
    expect(draft.days.every((d) => d.strips.length === 1)).toBe(true);
    expect(draft.days).toHaveLength(4);
  });

  it('gives a scene longer than a whole day its own day', () => {
    const b = { ...emptyBoard(), targetEighths: 8 };
    const draft = draftSchedule(scenes, [20, 1, 1, 1], b, ids());
    expect(draft.days[0]?.strips.map((s) => s.index)).toEqual([0]);
  });

  it('starts a new day rather than go from night back to day', () => {
    const s = parse('EXT. GÅRD - NATT\n\nA.\n\nINT. HUS - DAG\n\nB.').scenes;
    const draft = draftSchedule(s, [1, 1], emptyBoard(), ids());
    expect(draft.days.map((d) => d.strips.map((x) => x.index))).toEqual([[0], [1]]);
  });

  it('returns the board unchanged when everything is scheduled', () => {
    const full = board([0, 1, 2, 3]);
    expect(draftSchedule(scenes, [1, 1, 1, 1], full)).toBe(full);
  });
});

describe('export', () => {
  it('writes a row per strip with day and date, then the unscheduled', () => {
    const b = { ...board([1]), startDate: '2026-10-05' };
    const text = stripboardCsv(script, [8, 12, 2, 3], b);
    const rows = text.replace(/^﻿/, '').trim().split('\r\n');
    expect(rows[0]).toBe('Dag;Datum;Scen;I/E;Plats;Tid;Åttondelar;Roller;Synopsis');
    expect(rows[1]).toBe('1;2026-10-05;2;EXT;SKOLGÅRD;NATT;1 4/8;2 NOA, 1 VILDE;');
    expect(rows).toHaveLength(1 + 4);
  });
});
