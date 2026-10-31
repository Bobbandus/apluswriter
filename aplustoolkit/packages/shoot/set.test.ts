import { describe, expect, it } from 'vitest';
import type { Shot, Shotlist } from '../bridge/protocol';
import { parse } from '../fountain/parse';
import {
  addGear,
  addTake,
  blockingTips,
  dayReport,
  emptyShoot,
  ensureScene,
  gearNeeds,
  hasLens,
  mendSlate,
  nextOpenShot,
  nextTake,
  readShoot,
  refreshShoot,
  removeGear,
  sceneIndex,
  setDayLog,
  setShotState,
  shootingOrder,
  shotLetter,
  slateScene,
  takesCsv,
  takesOf,
  togglePacked,
  updateTake,
  type Take,
} from './set';

const script = parse('INT. KÖK - DAG\n\nHej.\n\nEXT. GÅRD - NATT\n\nMörkt.\n\nINT. KÖK - DAG\n\nIgen.');
const shot = (number: string, size = 'MS', extra: Partial<Shot> = {}): Shot => ({ number, size, description: '', ...extra });
const take = (scene: string | null, shotNo: string | null, n: number, extra: Partial<Take> = {}): Omit<Take, 'id'> => ({
  scene,
  slate: '1A',
  shot: shotNo,
  take: n,
  tc: '',
  at: 1000 + n,
  roll: 'A001',
  rating: null,
  soundIssue: false,
  note: '',
  continuity: '',
  ...extra,
});

describe('readShoot', () => {
  it('never throws and keeps what is usable', () => {
    for (const junk of [null, 1, 'x', [], { scenes: 'no', takes: [null, 1] }]) expect(() => readShoot(junk)).not.toThrow();
    const data = readShoot({
      scenes: [{ key: 's1', ref: { index: 0, heading: 'INT. KÖK - DAG' }, shots: { '1': { state: 'done' }, '2': { state: 'bogus' } } }, { key: 's1', ref: { index: 1, heading: 'X' } }],
      takes: [{ id: 't1', at: 5, take: 2, rating: 'good', scene: 's1', shot: '1' }, { id: 'no-time' }],
      gear: [{ id: 'g', name: '35mm', category: 'lens', qty: 2 }, { id: 'h', name: 'Mystery', category: 'banana' }],
      packed: { d1: ['g', 3] },
      days: { d1: { call: '07:00', junk: 1 } },
    });
    expect(data.scenes).toHaveLength(1);
    expect(data.scenes[0]?.shots).toEqual({ '1': { state: 'done' } });
    expect(data.takes).toHaveLength(1);
    expect(data.takes[0]).toMatchObject({ id: 't1', take: 2, rating: 'good', soundIssue: false });
    expect(data.gear.map((g) => g.category)).toEqual(['lens', 'other']);
    expect(data.packed).toEqual({ d1: ['g'] });
    expect(data.days).toEqual({ d1: { call: '07:00' } });
  });
});

describe('scenes', () => {
  it('makes a record once and finds it again', () => {
    const first = ensureScene(emptyShoot(), script.scenes, 2, 'k');
    expect(first.key).toBe('k');
    const again = ensureScene(first.data, script.scenes, 2, 'other');
    expect(again.key).toBe('k');
    expect(again.data).toBe(first.data);
    expect(sceneIndex(script.scenes, first.data).get(2)?.key).toBe('k');
  });

  it('follows a scene that moved in the script', () => {
    const { data } = ensureScene(emptyShoot(), script.scenes, 1, 'gård');
    const moved = parse('INT. HALL - DAG\n\nNy.\n\nINT. KÖK - DAG\n\nHej.\n\nEXT. GÅRD - NATT\n\nMörkt.');
    const refreshed = refreshShoot(moved.scenes, data);
    expect(refreshed.scenes[0]?.ref.index).toBe(2);
    expect(refreshShoot(moved.scenes, refreshed)).toBe(refreshed);
  });
});

describe('takes', () => {
  it('counts takes per scene and shot', () => {
    let data = addTake(emptyShoot(), take('s', '1', 1));
    data = addTake(data, take('s', '1', 2));
    data = addTake(data, take('s', '2', 1));
    expect(nextTake(data, 's', '1')).toBe(3);
    expect(nextTake(data, 's', '3')).toBe(1);
    expect(takesOf(data, 's', '1').map((t) => t.take)).toEqual([1, 2]);
  });

  it('puts the shot in the can when a take is marked good', () => {
    let { data } = ensureScene(emptyShoot(), script.scenes, 0, 's');
    data = addTake(data, take('s', '1', 1, { id: 'x' } as Partial<Take>));
    const id = data.takes[0]!.id;
    data = updateTake(data, id, { rating: 'good' });
    expect(data.scenes[0]?.shots['1']?.state).toBe('done');
    // Taking the mark off leaves the shot alone.
    expect(updateTake(data, id, { rating: null }).scenes[0]?.shots['1']?.state).toBe('done');
  });
});

describe('the slate', () => {
  it('letters shots, skipping I and O', () => {
    expect([1, 2, 8, 9, 13, 14, 24, 25].map(shotLetter)).toEqual(['A', 'B', 'H', 'J', 'N', 'P', 'Z', 'AA']);
  });

  it('writes scene and shot the slate way', () => {
    expect(slateScene('35', '1')).toBe('35A');
    expect(slateScene('35', '2A')).toBe('35-2A');
    expect(slateScene('1', '1A')).toBe('1A');
    expect(slateScene('1', '1b')).toBe('1B');
    expect(slateScene('35', 'C')).toBe('35C');
    expect(slateScene('1', '12A')).toBe('1-12A');
    expect(slateScene('35', null)).toBe('35');
  });

  it('finds the next shot still to do', () => {
    const shots = [shot('1'), shot('2'), shot('3')];
    let { data } = ensureScene(emptyShoot(), script.scenes, 0, 's');
    data = setShotState(data, 's', '2', 'done');
    const scene = data.scenes[0];
    expect(nextOpenShot(shots, scene, '1')).toBe('3');
    expect(nextOpenShot(shots, scene, '3')).toBe('1');
    expect(nextOpenShot(shots, scene, null)).toBe('1');
    data = setShotState(setShotState(data, 's', '1', 'done'), 's', '3', 'skip');
    expect(nextOpenShot(shots, data.scenes[0], '1')).toBeNull();
  });
});

describe('gear', () => {
  it('reads lenses and rigs off the shots', () => {
    const needs = gearNeeds([shot('1', 'WS', { lens: 24, movement: 'Dolly in' }), shot('2', 'CU', { lens: 85, movement: 'Handhållen' }), shot('3', 'MS', { lens: 24, movement: 'Statisk' })]);
    expect(needs).toEqual({ lenses: [24, 85], rigs: ['tripod', 'dolly', 'handheld'] });
  });

  it('knows a zoom covers the lenses inside it', () => {
    const gear = [{ id: 'a', name: 'Canon 24-70 2.8', category: 'lens' as const, qty: 1 }, { id: 'b', name: 'Sigma 85mm', category: 'lens' as const, qty: 1 }];
    expect(hasLens(gear, 35)).toBe(true);
    expect(hasLens(gear, 85)).toBe(true);
    expect(hasLens(gear, 135)).toBe(false);
    expect(hasLens(gear, 2)).toBe(false);
  });

  it('forgets what was packed when an item goes', () => {
    let data = addGear(emptyShoot(), { name: 'Stativ', category: 'grip', qty: 1 }, 'g');
    data = togglePacked(data, 'd1', 'g');
    expect(data.packed['d1']).toEqual(['g']);
    expect(removeGear(data, 'g').packed['d1']).toEqual([]);
    expect(togglePacked(data, 'd1', 'g').packed['d1']).toEqual([]);
  });
});

describe('blocking', () => {
  it('shoots wide first and inserts last, otherwise in list order', () => {
    const order = shootingOrder([shot('1', 'CU'), shot('2', 'INSERT'), shot('3', 'WS'), shot('4', 'OTS'), shot('5', 'MS')]);
    expect(order.map((s) => s.number)).toEqual(['3', '5', '4', '1', '2']);
  });

  it('gives the tips that apply', () => {
    const scene = script.scenes[1]!;
    const tips = blockingTips(scene, [shot('1', 'CU'), shot('2', 'WS'), shot('3', 'OTS', { movement: 'Gimbal' })]);
    expect(tips).toEqual(expect.arrayContaining(['wideFirst', 'oneDirection', 'moving', 'night', 'ext']));
    expect(tips).not.toContain('insertsLast');
  });
});

describe('dayReport', () => {
  it('says what is done and what is left', () => {
    let { data } = ensureScene(emptyShoot(), script.scenes, 0, 'a');
    data = setShotState(data, 'a', '1', 'done');
    data = setShotState(data, 'a', '2', 'skip');
    data = addTake(data, take('a', '1', 1, { rating: 'good' }));
    data = addTake(data, take(null, null, 1, { at: 5000 }));
    const lists = new Map<number, Shotlist>([
      [0, { scene: { index: 0, heading: 'INT. KÖK - DAG' }, shots: [shot('1'), shot('2')] }],
      [1, { scene: { index: 1, heading: 'EXT. GÅRD - NATT' }, shots: [shot('1'), shot('2')] }],
    ]);
    const report = dayReport([0, 1], lists, data, sceneIndex(script.scenes, data), 1);
    expect(report).toMatchObject({ shots: 4, done: 1, skipped: 1, takes: 1, good: 1, complete: 1, otherTakes: 1 });
    expect(report.scenes[1]).toMatchObject({ complete: false, started: false, remaining: ['1', '2'] });
  });
});

describe('mending old takes', () => {
  it('turns "1-1A" into "1A" and leaves the rest alone', () => {
    expect(mendSlate('1-1A')).toBe('1A');
    expect(mendSlate('35-35C')).toBe('35C');
    expect(mendSlate('35-2A')).toBe('35-2A');
    expect(mendSlate('1A')).toBe('1A');
    expect(readShoot({ takes: [{ id: 't', at: 1, slate: '1-1A' }] }).takes[0]?.slate).toBe('1A');
  });
});

describe('days and export', () => {
  it('drops empty day fields', () => {
    const data = setDayLog(setDayLog(emptyShoot(), 'd', { call: '07:00', wrap: '18:00' }), 'd', { wrap: '' });
    expect(data.days['d']).toEqual({ call: '07:00' });
  });

  it('writes the take log for Excel', () => {
    const data = addTake(emptyShoot(), take('s', '1', 3, { tc: '01:00:00:00', rating: 'ng', note: 'fokus; mjuk' }));
    const lines = takesCsv(data.takes).split('\r\n');
    expect(lines[0]?.startsWith('﻿Tid;Tidskod')).toBe(true);
    expect(lines[1]).toContain(';01:00:00:00;A001;1A;1;3;NG;;"fokus; mjuk";');
  });
});
