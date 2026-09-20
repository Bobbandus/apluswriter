import { describe, expect, it } from 'vitest';
import { sceneNoteEdit } from '../bridge/apply';
import { parse } from './parse';
import { energyPaths, timeline } from './timeline';

const SOURCE = [
  'INT. KÖK - DAG',
  '[[day: 1]]',
  '[[energy: 4]]',
  '',
  'Erik lagar mat.',
  '',
  'INT. HALL - DAG',
  '',
  'Vidare.',
  '',
  'EXT. GATA - NATT',
  '[[dag: 2]]',
  '[[energi: 9]]',
  '',
  'Regn.',
  '',
  'INT. MINNE - DAG',
  '[[day: 1]]',
  '',
  'Ett minne.',
  '',
].join('\n');

const script = parse(SOURCE);

describe('scene metadata', () => {
  it('reads day and energy, in English or Swedish', () => {
    expect(script.scenes.map((s) => [s.meta.day ?? null, s.meta.energy ?? null])).toEqual([
      [1, 4],
      [null, null],
      [2, 9],
      [1, null],
    ]);
  });

  it('ignores a day or energy that does not make sense', () => {
    const odd = parse('INT. A - DAG\n[[day: soon]]\n[[energy: 11]]\n\nHej.');
    expect(odd.scenes[0]?.meta.day).toBeUndefined();
    expect(odd.scenes[0]?.meta.energy).toBeUndefined();
  });
});

describe('timeline', () => {
  const t = timeline(script.scenes);

  it('lets scenes inherit the day until another one says otherwise', () => {
    expect(t.rows.map((r) => r.effectiveDay)).toEqual([1, 1, 2, 1]);
  });

  it('groups scenes by day, in day order', () => {
    expect(t.days).toEqual([
      { day: 1, scenes: [0, 1, 3] },
      { day: 2, scenes: [2] },
    ]);
  });

  it('warns where the story goes backwards', () => {
    expect(t.warnings).toEqual([{ index: 3, day: 1, after: 2 }]);
  });

  it('does not warn when the same day is repeated, or nothing is stated', () => {
    expect(timeline(parse('INT. A - DAG\n[[day: 2]]\n\nx\n\nINT. B - DAG\n[[day: 2]]\n\ny').scenes).warnings).toEqual([]);
    expect(timeline(parse('INT. A - DAG\n\nx').scenes).days).toEqual([]);
  });

  it('never inherits energy', () => {
    expect(t.rows.map((r) => r.energy)).toEqual([4, null, 9, null]);
  });
});

describe('energy curve', () => {
  it('runs from calm (0) to intense (1) along the script, with a gap where a scene is unrated', () => {
    const paths = energyPaths(timeline(script.scenes).rows);
    expect(paths).toEqual([[{ x: 0, y: 1 / 3 }], [{ x: 2 / 3, y: 8 / 9 }]]);
  });

  it('draws one line through consecutive rated scenes', () => {
    expect(energyPaths([{ energy: 1 }, { energy: 10 }])).toEqual([
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    ]);
  });
});

describe('sceneNoteEdit', () => {
  const apply = (source: string, edit: { from: number; to: number; insert: string } | null) =>
    edit ? source.slice(0, edit.from) + edit.insert + source.slice(edit.to) : source;

  it('adds a note under the heading and its other notes', () => {
    const source = 'INT. A - DAG\n\nHej.';
    expect(apply(source, sceneNoteEdit(source, 0, ['day', 'dag'], '3'))).toBe('INT. A - DAG\n[[day: 3]]\n\nHej.');
  });

  it('changes an existing note in the spelling the writer used', () => {
    expect(apply(SOURCE, sceneNoteEdit(SOURCE, 2, ['day', 'dag'], '5'))).toContain('[[dag: 5]]');
    expect(apply(SOURCE, sceneNoteEdit(SOURCE, 0, ['day', 'dag'], '5'))).toContain('[[day: 5]]');
  });

  it('removes a note without leaving an empty line behind', () => {
    const out = apply(SOURCE, sceneNoteEdit(SOURCE, 0, ['day', 'dag'], null));
    expect(out.startsWith('INT. KÖK - DAG\n[[energy: 4]]\n\nErik')).toBe(true);
  });

  it('does nothing to remove what is not there, or for a scene that does not exist', () => {
    expect(sceneNoteEdit(SOURCE, 1, ['day', 'dag'], null)).toBeNull();
    expect(sceneNoteEdit(SOURCE, 99, ['day'], '1')).toBeNull();
  });
});
