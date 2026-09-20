import { describe, expect, it } from 'vitest';
import { parse } from '../fountain/parse';
import { clockFor, dayPart, gameTimeFor, recordingLog, seconds, voiceLines, voiceLinesCsv } from './minecraft';

describe('game time', () => {
  it('maps a heading\'s time of day to a tick in that part of the day', () => {
    expect(gameTimeFor('DAG')).toBe(3000);
    expect(gameTimeFor('NATT')).toBe(15000);
    expect(gameTimeFor('KVÄLL')).toBe(12500);
    expect(gameTimeFor('MORGON')).toBe(23500);
    expect(gameTimeFor('MIDNATT')).toBe(18000);
    expect(gameTimeFor('night')).toBe(15000);
    expect(gameTimeFor('NÅGONTING')).toBeNull();
    expect(gameTimeFor(null)).toBeNull();
  });

  it('says what part of the day a tick is, and what the game clock reads', () => {
    expect(dayPart(3000)).toBe('day');
    expect(dayPart(12500)).toBe('sunset');
    expect(dayPart(15000)).toBe('night');
    expect(dayPart(23500)).toBe('sunrise');
    expect(clockFor(0)).toBe('06:00');
    expect(clockFor(6000)).toBe('12:00');
    expect(clockFor(18000)).toBe('00:00');
  });

  it('is read from the script as [[time: n]], with the Swedish key too, and ignores nonsense', () => {
    const scenes = parse('INT. A - DAG\n[[time: 13000]]\n\nx\n\nINT. B - DAG\n[[tid: 99999]]\n\ny\n').scenes;
    expect(scenes[0]?.meta.time).toBe(13000);
    expect(scenes[1]?.meta.time).toBeUndefined();
  });
});

describe('recording log', () => {
  const script = parse(
    [
      'INT. A - DAG', '[[recording: Kväll1]] [[take: 2]] [[at: 12:30]]', '', 'x', '',
      'INT. B - DAG', '[[recording: Kväll1]] [[at: 03:10]] [[pov: Spoke]] [[server: Unstable]]', '', 'y', '',
      'INT. C - DAG', '', 'z', '',
      'INT. D - DAG', '[[recording: Dag2]]', '', 'w', '',
    ].join('\n'),
  );

  it('groups scenes by recording, each in the order they come in it, and puts what is unrecorded last', () => {
    const log = recordingLog(script.scenes);
    expect(log.map((group) => group.recording)).toEqual(['Kväll1', 'Dag2', null]);
    expect(log[0]!.scenes.map((scene) => scene.index)).toEqual([1, 0]);
    expect(log[2]!.scenes.map((scene) => scene.heading)).toEqual(['INT. C - DAG']);
  });

  it('carries take, start, server and point of view', () => {
    const scene = recordingLog(script.scenes)[0]!.scenes.find((s) => s.index === 1)!;
    expect(scene).toMatchObject({ at: '03:10', pov: 'Spoke', server: 'Unstable', take: null });
  });

  it('reads a timestamp in seconds, and anything else as last', () => {
    expect(seconds('12:30')).toBe(750);
    expect(seconds('1:02:30')).toBe(3750);
    expect(seconds(undefined)).toBeGreaterThan(1e9);
  });
});

describe('voice lines', () => {
  const script = parse('INT. A - DAG\n\nERIK\n(tyst)\nHej.\n\nVILDE\nHej, Erik.\n\nINT. B - NATT\n\nERIK\nNatt nu.\n');

  it('lists every spoken line in order with role, scene and player', () => {
    const rows = voiceLines(script, { erik: 'Spoke' });
    expect(rows.map((row) => [row.line, row.scene, row.role, row.player, row.text])).toEqual([
      [1, 0, 'ERIK', 'Spoke', 'Hej.'],
      [2, 0, 'VILDE', '', 'Hej, Erik.'],
      [3, 1, 'ERIK', 'Spoke', 'Natt nu.'],
    ]);
  });

  it('writes CSV that survives commas and quotes, with an empty column to tick off', () => {
    const csv = voiceLinesCsv(voiceLines(script, {}));
    const [header, first, second] = csv.split('\n');
    expect(header).toBe('Rad,Scen,Rubrik,Roll,Spelare,Replik,Inspelad');
    expect(first).toBe('1,1,INT. A - DAG,ERIK,,Hej.,');
    expect(second).toBe('2,1,INT. A - DAG,VILDE,,"Hej, Erik.",');
  });
});
