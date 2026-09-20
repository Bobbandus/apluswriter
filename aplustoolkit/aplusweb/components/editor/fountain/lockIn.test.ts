import { describe, expect, it } from 'vitest';
import { litRange } from './lockIn';

const lines = ['INT. A - DAG', '', 'Första.', 'Andra.', '', 'ERIK', 'Hej.', '', 'EXT. B - NATT', '', 'Regn.'];

describe('what stays lit in focus mode', () => {
  it('lights the paragraph around the caret and nothing else', () => {
    expect(litRange(lines, 4, 'paragraph')).toEqual([3, 4]);
    expect(litRange(lines, 7, 'paragraph')).toEqual([6, 7]);
  });

  it('lights the whole scene, up to the next heading', () => {
    expect(litRange(lines, 4, 'scene')).toEqual([1, 8]);
    expect(litRange(lines, 11, 'scene')).toEqual([9, 11]);
  });

  it('lights just the empty line when the caret sits on one', () => {
    expect(litRange(lines, 2, 'paragraph')).toEqual([2, 2]);
  });
});
