import { describe, expect, it } from 'vitest';
import { outlineRows, type OutlineRow } from './outline';
import { parse } from './parse';

const SCRIPT = [
  'INT. PROLOG - DAG',
  '',
  'Innan allt.',
  '',
  '# Akt I',
  '',
  '## Sekvens A',
  '',
  'INT. KÖK - DAG',
  '',
  'Erik lagar mat.',
  '',
  'EXT. GATA - NATT',
  '',
  'Det regnar.',
  '',
  '## Sekvens B',
  '',
  'INT. BIL - NATT',
  '',
  'De kör.',
  '',
  '# Akt II',
  '',
  'EXT. HAMN - DAG',
  '',
  'Vatten.',
  '',
].join('\n');

const rowsOf = (source: string, collapsed: number[] = []) => {
  const script = parse(source);
  return outlineRows(script.scenes, script.sections, new Set(collapsed));
};

/** A row in one line, so a whole outline reads as a list. */
const label = (row: OutlineRow) =>
  row.kind === 'section' ? `${'#'.repeat(row.depth)} ${row.title}` : `${' '.repeat(row.indent)}${row.scene.heading}`;

describe('outlineRows', () => {
  it('lays scenes and sections out in document order', () => {
    expect(rowsOf(SCRIPT).map(label)).toEqual([
      'INT. PROLOG - DAG',
      '# Akt I',
      '## Sekvens A',
      '  INT. KÖK - DAG',
      '  EXT. GATA - NATT',
      '## Sekvens B',
      '  INT. BIL - NATT',
      '# Akt II',
      ' EXT. HAMN - DAG',
    ]);
  });

  it('indents a scene by the section it sits in, and not at all before the first', () => {
    const scenes = rowsOf(SCRIPT).filter((row) => row.kind === 'scene');
    expect(scenes.map((row) => (row.kind === 'scene' ? row.indent : -1))).toEqual([0, 2, 2, 2, 1]);
  });

  it('counts the scenes a section holds, nested sections included', () => {
    const counts = rowsOf(SCRIPT)
      .filter((row) => row.kind === 'section')
      .map((row) => (row.kind === 'section' ? [row.title, row.sceneCount] : []));
    expect(counts).toEqual([
      ['Akt I', 3],
      ['Sekvens A', 2],
      ['Sekvens B', 1],
      ['Akt II', 1],
    ]);
  });

  it('hides what a collapsed section holds, and only that', () => {
    // Sequence A is the second section, index 1.
    expect(rowsOf(SCRIPT, [1]).map(label)).toEqual([
      'INT. PROLOG - DAG',
      '# Akt I',
      '## Sekvens A',
      '## Sekvens B',
      '  INT. BIL - NATT',
      '# Akt II',
      ' EXT. HAMN - DAG',
    ]);
  });

  it('hides nested sections along with the act that holds them', () => {
    const rows = rowsOf(SCRIPT, [0]);
    expect(rows.map(label)).toEqual(['INT. PROLOG - DAG', '# Akt I', '# Akt II', ' EXT. HAMN - DAG']);
    // It still reports how much is folded away inside it.
    expect(rows[1]).toMatchObject({ kind: 'section', collapsed: true, sceneCount: 3 });
  });

  it('keeps a scene index that points into the scenes list, folded or not', () => {
    const script = parse(SCRIPT);
    const scene = rowsOf(SCRIPT, [0]).find((row) => row.kind === 'scene' && row.scene.heading === 'EXT. HAMN - DAG');
    expect(scene && scene.kind === 'scene' ? script.scenes[scene.index]?.heading : null).toBe('EXT. HAMN - DAG');
  });

  it('is just the scenes when there are no sections', () => {
    const rows = rowsOf('INT. A - DAG\n\nEtt.\n\nEXT. B - NATT\n\nTvå.');
    expect(rows.every((row) => row.kind === 'scene' && row.indent === 0)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('shows a section with nothing under it', () => {
    expect(rowsOf('# Tom akt\n\n# Nästa akt\n\nINT. A - DAG\n\nEtt.').map(label)).toEqual([
      '# Tom akt',
      '# Nästa akt',
      ' INT. A - DAG',
    ]);
  });
});
