import { describe, expect, it } from 'vitest';
import { diffLines, diffStats, hunks } from './diff';

const ops = (a: string, b: string) => diffLines(a, b).map((l) => `${l.op === 'same' ? ' ' : l.op === 'add' ? '+' : '-'}${l.text}`);

describe('diffLines', () => {
  it('reports nothing for identical text', () => {
    expect(diffStats(diffLines('a\nb', 'a\nb'))).toEqual({ added: 0, removed: 0 });
  });

  it('finds a changed line in the middle', () => {
    expect(ops('INT. KÖK - DAG\n\nHan äter.\n\nSlut.', 'INT. KÖK - DAG\n\nHan dricker.\n\nSlut.')).toEqual([
      ' INT. KÖK - DAG',
      ' ',
      '-Han äter.',
      '+Han dricker.',
      ' ',
      ' Slut.',
    ]);
  });

  it('finds added and removed lines', () => {
    expect(ops('a\nb\nc', 'a\nc\nd')).toEqual([' a', '-b', ' c', '+d']);
  });

  it('numbers lines on both sides', () => {
    const [, removed, added] = diffLines('a\nb', 'a\nc');
    expect(removed).toMatchObject({ op: 'remove', oldLine: 2 });
    expect(added).toMatchObject({ op: 'add', newLine: 2 });
  });

  it('handles a whole feature quickly when only one line changed', () => {
    const big = Array.from({ length: 6000 }, (_, i) => `Line ${i}`).join('\n');
    const edited = big.replace('Line 3000', 'Line three thousand');
    const started = performance.now();
    expect(diffStats(diffLines(big, edited))).toEqual({ added: 1, removed: 1 });
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('hunks', () => {
  it('keeps only the changes and their context', () => {
    const before = Array.from({ length: 30 }, (_, i) => `L${i}`).join('\n');
    const after = before.replace('L15', 'CHANGED');
    const [only, ...rest] = hunks(diffLines(before, after), 1);
    expect(rest).toEqual([]);
    expect(only?.lines.map((l) => l.text)).toEqual(['L14', 'L15', 'CHANGED', 'L16']);
  });
});
