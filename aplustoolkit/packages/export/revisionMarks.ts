import { diffLines } from '../fountain/diff';

/**
 * Which printed lines carry a revision asterisk.
 *
 * A revised script is printed with a `*` in the right margin beside every line
 * that changed since the draft it is being compared with, so a reader of the
 * new pages can find what moved without reading them all again.
 *
 * "Changed" is decided on the **source**, line by line, and then looked up by
 * where each printed line came from. That is what makes it right when a long
 * paragraph is wrapped across several printed lines: only the printed lines
 * that come from a changed source line are marked, not the whole paragraph.
 */

export type IsRevised = (sourceOffset: number) => boolean;

/** Nothing is marked. What an export with no baseline uses. */
export const NOTHING_REVISED: IsRevised = () => false;

/**
 * Builds the lookup for a script against the draft before it.
 *
 * Lines that were only *added* count as revised; lines that were removed have
 * nothing left on the page to mark, and blank lines never print.
 */
export function revisionMarks(baseline: string, current: string): IsRevised {
  const changed = new Set<number>();
  for (const line of diffLines(baseline, current)) {
    if (line.op === 'add' && line.text.trim() !== '' && line.newLine !== undefined) changed.add(line.newLine);
  }
  if (changed.size === 0) return NOTHING_REVISED;

  // Offset of the first character of each line, so an offset can be turned
  // back into a line number without rescanning the text.
  const starts: number[] = [0];
  for (let i = 0; i < current.length; i += 1) if (current[i] === '\n') starts.push(i + 1);

  return (offset) => {
    if (offset < 0) return false; // synthetic lines: (MORE), (CONT'D)
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((starts[middle] as number) <= offset) low = middle;
      else high = middle - 1;
    }
    return changed.has(low + 1);
  };
}
