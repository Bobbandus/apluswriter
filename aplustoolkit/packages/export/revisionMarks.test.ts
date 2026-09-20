import { describe, expect, it } from 'vitest';
import { NOTHING_REVISED, revisionMarks } from './revisionMarks';

const OLD = 'INT. KÖK - DAG\n\nERIK\nHej.\n\nVILDE\nBra.\n';

/** The line numbers a script's revision marks light up, 1-based. */
function marked(baseline: string, current: string): number[] {
  const isRevised = revisionMarks(baseline, current);
  const lines = current.split('\n');
  const out: number[] = [];
  let offset = 0;
  lines.forEach((line, index) => {
    // Ask about the first visible character of each line, as the paginator does.
    if (line.trim() && isRevised(offset)) out.push(index + 1);
    offset += line.length + 1;
  });
  return out;
}

describe('revisionMarks', () => {
  it('marks nothing when the script has not changed', () => {
    expect(revisionMarks(OLD, OLD)).toBe(NOTHING_REVISED);
    expect(marked(OLD, OLD)).toEqual([]);
  });

  it('marks a changed line and only that line', () => {
    const now = OLD.replace('Hej.', 'Hej, du.');
    expect(marked(OLD, now)).toEqual([4]);
  });

  it('marks a line that was added, wherever it went', () => {
    const now = 'INT. KÖK - DAG\n\nERIK\nHej.\n\nNOAH\nNy replik.\n\nVILDE\nBra.\n';
    expect(marked(OLD, now)).toEqual([6, 7]);
  });

  // A removed line has nothing left on the page to put an asterisk beside.
  it('does not mark anything for a line that was taken away', () => {
    expect(marked(OLD, 'INT. KÖK - DAG\n\nERIK\nHej.\n')).toEqual([]);
  });

  it('never marks a blank line, so no asterisk hangs in empty space', () => {
    const now = 'INT. KÖK - DAG\n\n\n\nERIK\nHej.\n\nVILDE\nBra.\n';
    expect(marked(OLD, now)).toEqual([]);
  });

  it('leaves the lines that did not change unmarked, even between two that did', () => {
    const now = 'INT. KÖK - DAG\n\nERIK\nHej nu.\n\nVILDE\nBra då.\n';
    expect(marked(OLD, now)).toEqual([4, 7]);
  });

  // The paginator gives each printed line the offset of the source character it
  // starts at. A long paragraph is one printed line per wrap, and only the wraps
  // that begin inside a changed source line get an asterisk.
  it('answers per source line, so a wrapped paragraph is marked where it changed', () => {
    const before = 'Första raden.\nAndra raden.\nTredje raden.';
    const after = 'Första raden.\nAndra ändrad.\nTredje raden.';
    const isRevised = revisionMarks(before, after);
    expect(isRevised(0)).toBe(false);
    expect(isRevised(after.indexOf('Andra'))).toBe(true);
    expect(isRevised(after.indexOf('Andra') + 8)).toBe(true); // middle of that line
    expect(isRevised(after.indexOf('Tredje'))).toBe(false);
  });

  it('ignores lines with no source position, like (MORE) and (CONT\'D)', () => {
    expect(revisionMarks(OLD, OLD.replace('Hej.', 'Nej.'))(-1)).toBe(false);
  });
});
