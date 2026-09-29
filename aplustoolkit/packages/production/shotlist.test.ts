import { describe, expect, it } from 'vitest';
import type { Shotlist } from '../bridge/protocol';
import { parse } from '../fountain/parse';
import {
  attachTo,
  isBlankShot,
  moveShot,
  newShot,
  nextShotNumber,
  readShotlists,
  refreshShotlists,
  renumber,
  resolveShotlists,
  shotlistCsv,
  shotSpecs,
} from './shotlist';

const script = parse('INT. KÖK - DAG\n\nHej.\n\nEXT. GÅRD - NATT\n\nMörkt.\n\nINT. KÖK - DAG\n\nIgen.');
const list = (index: number, heading: string, numbers: string[] = ['1']): Shotlist => ({
  scene: { index, heading },
  shots: numbers.map((number) => ({ number, size: 'MS', description: `Bild ${number}` })),
});

describe('reading stored shotlists', () => {
  it('never throws and keeps what is usable', () => {
    for (const junk of [null, {}, 'x', [1, null, { scene: 'no' }]]) expect(() => readShotlists(junk)).not.toThrow();
    const read = readShotlists([
      { scene: { index: 0, heading: 'INT. KÖK - DAG' }, shots: [{ number: 2, size: 'CU', description: 'Händer', lens: 50, subjects: ['VILDE', 3] }, 'junk'] },
    ]);
    expect(read).toEqual([
      { scene: { index: 0, heading: 'INT. KÖK - DAG' }, shots: [{ number: '2', size: 'CU', description: 'Händer', lens: 50, subjects: ['VILDE'] }] },
    ]);
  });
});

describe('which scene a list belongs to', () => {
  it('keeps two same-named scenes apart', () => {
    expect(resolveShotlists(script.scenes, [list(2, 'INT. KÖK - DAG'), list(0, 'INT. KÖK - DAG')])).toEqual([2, 0]);
  });

  it('detaches a list whose heading is gone', () => {
    expect(resolveShotlists(script.scenes, [list(1, 'EXT. PARK - DAG')])).toEqual([null]);
  });

  it('re-attaches a detached list to a chosen scene', () => {
    const attached = attachTo(list(1, 'EXT. PARK - DAG'), script.scenes, 1);
    expect(attached.scene).toEqual({ index: 1, heading: 'EXT. GÅRD - NATT' });
    expect(attached.sceneId).toBeUndefined();
    expect(resolveShotlists(script.scenes, [attached])).toEqual([1]);
  });

  it('holds on through a rewritten heading once the scene has an id', () => {
    const before = parse('INT. KÖK - DAG\n[[id: s_1]]\n\nHej.');
    const attached = attachTo(list(0, 'x'), before.scenes, 0);
    expect(attached.sceneId).toBe('s_1');
    const after = parse('INT. KÖKET - KVÄLL\n[[id: s_1]]\n\nHej.');
    expect(resolveShotlists(after.scenes, [attached])).toEqual([0]);
  });
});

describe('keeping lists in step with the script', () => {
  it('returns the same array when nothing drifted', () => {
    const lists = [list(1, 'EXT. GÅRD - NATT')];
    expect(refreshShotlists(script.scenes, lists)).toBe(lists);
  });

  it('follows a scene pushed down by a new one above', () => {
    const moved = parse('INT. HALL - DAG\n\nNy.\n\nINT. KÖK - DAG\n\nHej.\n\nEXT. GÅRD - NATT\n\nMörkt.');
    expect(refreshShotlists(moved.scenes, [list(1, 'EXT. GÅRD - NATT')])[0]?.scene.index).toBe(2);
  });
});

describe('shots', () => {
  it('numbers the next shot after the highest', () => {
    expect(nextShotNumber([])).toBe('1');
    expect(nextShotNumber(list(0, 'x', ['1', '2', '2A']).shots)).toBe('3');
    expect(nextShotNumber(list(0, 'x', ['A']).shots)).toBe('1');
  });

  it('opens wide, then goes to medium', () => {
    expect(newShot([]).size).toBe('WS');
    expect(newShot(list(0, 'x').shots)).toEqual({ number: '2', size: 'MS', description: '' });
  });

  it('renumbers in listed order and keeps untouched shots identical', () => {
    const shots = list(0, 'x', ['1', '3', '2A']).shots;
    const next = renumber(shots);
    expect(next.map((s) => s.number)).toEqual(['1', '2', '3']);
    expect(next[0]).toBe(shots[0]);
  });

  it('moves a shot and clamps at the ends', () => {
    const shots = list(0, 'x', ['1', '2', '3']).shots;
    expect(moveShot(shots, 0, 2).map((s) => s.number)).toEqual(['2', '3', '1']);
    expect(moveShot(shots, 2, -5).map((s) => s.number)).toEqual(['3', '1', '2']);
  });

  it('describes a shot in one line', () => {
    expect(shotSpecs({ number: '1', size: 'CU', description: '', lens: 85, angle: 'Låg', movement: 'Dolly in' })).toBe('85 mm · Låg · Dolly in');
    expect(shotSpecs({ number: '1', size: 'CU', description: '' })).toBe('');
  });

  it('knows a blank shot from a started one', () => {
    expect(isBlankShot({ number: '1', size: 'MS', description: ' ' })).toBe(true);
    expect(isBlankShot({ number: '1', size: 'MS', description: '', lens: 35 })).toBe(false);
  });
});

describe('export', () => {
  it('lists shots in script order and keeps detached lists last', () => {
    const text = shotlistCsv(script, [list(9, 'EXT. PARK - DAG'), list(2, 'INT. KÖK - DAG', ['1', '2']), list(0, 'INT. KÖK - DAG')]);
    const rows = text.replace(/^﻿/, '').trim().split('\r\n');
    expect(rows[0]).toBe('Scen;Rubrik;Bild;Storlek;Vinkel;Rörelse;Objektiv;I bild;Beskrivning;Anteckning');
    expect(rows.slice(1).map((r) => r.split(';').slice(0, 3).join(';'))).toEqual([
      '1;INT. KÖK - DAG;1',
      '3;INT. KÖK - DAG;1',
      '3;INT. KÖK - DAG;2',
      ';EXT. PARK - DAG;1',
    ]);
  });
});
