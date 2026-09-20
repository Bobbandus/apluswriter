/**
 * Ticking off a to-do means deleting its note from the script.
 *
 * A `[[todo: …]]` is text the writer (or Claude, through a suggestion the
 * writer accepted) put in the file, so finishing one has to take it back out —
 * and leave the page as if it had never been there. That is more than deleting
 * the brackets:
 *
 * - A note standing alone on a line takes the whole line with it, or the
 *   script keeps an empty line where it was.
 * - A note that was its own block, blank line above and below, must not leave
 *   two blank lines behind. Fountain reads every extra blank line as an
 *   intentional empty action line, so that would be a visible change to the
 *   script, not just a tidy-up.
 * - A note in the middle of a line takes one neighbouring space, not two.
 */

export interface Range {
  from: number;
  to: number;
}

export interface Removal {
  from: number;
  to: number;
  insert: '';
}

const isBlank = (text: string) => text.trim() === '';

export function removeTodo(source: string, note: Range): Removal {
  const lineStart = source.lastIndexOf('\n', note.from - 1) + 1;
  const newline = source.indexOf('\n', note.to);
  const lineEnd = newline < 0 ? source.length : newline;

  const before = source.slice(lineStart, note.from);
  const after = source.slice(note.to, lineEnd);

  /* ---- inline: something else shares the line ---- */
  if (!isBlank(before) || !isBlank(after)) {
    // One space goes with it, and only one, so "a [[todo: x]] b" becomes "a b".
    if (before.endsWith(' ') || before.endsWith('\t')) return { from: note.from - 1, to: note.to, insert: '' };
    if (after.startsWith(' ') || after.startsWith('\t')) return { from: note.from, to: note.to + 1, insert: '' };
    return { from: note.from, to: note.to, insert: '' };
  }

  /* ---- alone on its line ---- */
  if (newline < 0) {
    // The last line of the file: take the newline before it instead, so the
    // script does not end in a dangling blank line.
    return lineStart > 0
      ? { from: lineStart - 1, to: lineEnd, insert: '' }
      : { from: lineStart, to: lineEnd, insert: '' };
  }

  const lineAbove = lineStart === 0 || source[lineStart - 2] === '\n';
  const lineBelow = source[newline + 1] === '\n' || newline + 1 >= source.length;

  // A whole block of its own: drop one of the two blank lines around it too.
  if (lineStart > 0 && lineAbove && lineBelow && newline + 1 < source.length) {
    return { from: lineStart, to: newline + 2, insert: '' };
  }

  return { from: lineStart, to: newline + 1, insert: '' };
}
