import { scanInline } from '../fountain/inline';

/**
 * Styled text for the page.
 *
 * The page shows the writer's words with the markup gone and the emphasis
 * kept: `**bold**` is bold, `[[notes]]` are not there at all. Every visible
 * character also remembers where it came from in the source, which is what
 * lets a page break computed here be drawn at the right place in the editor.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface StyledChar {
  ch: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Offset of this character in the element's raw source. */
  raw: number;
}

/**
 * Turns an element's raw source into visible characters with their styles.
 *
 * `hide` lists extra source ranges that must not print: forcing markup (`.`,
 * `!`, `@`, `>`, `~`), a `#12#` scene number, a dual-dialogue `^`. Those only
 * ever told the parser what the line was.
 */
export function styledChars(raw: string, hide: readonly (readonly [number, number])[] = []): StyledChar[] {
  const { spans } = scanInline(raw, 0);
  const out: StyledChar[] = [];

  for (let i = 0; i < raw.length; i += 1) {
    let hidden = hide.some(([from, to]) => i >= from && i < to);
    let bold = false;
    let italic = false;
    let underline = false;

    for (const span of hidden ? [] : spans) {
      if (i < span.from || i >= span.to) continue;

      // Notes and tags never print.
      if (span.type === 'note' || span.type === 'tag') {
        hidden = true;
        break;
      }

      // The backslash of an escape is markup; the escaped character is text.
      if (span.type === 'escape') {
        if (i === span.from) hidden = true;
        continue;
      }

      // Delimiters (outside the content) are markup.
      if (i < span.contentFrom || i >= span.contentTo) {
        hidden = true;
        break;
      }

      if (span.type === 'bold') bold = true;
      else if (span.type === 'italic') italic = true;
      else if (span.type === 'boldItalic') {
        bold = true;
        italic = true;
      } else if (span.type === 'underline') underline = true;
    }

    if (hidden) continue;
    const ch = raw[i] === '\t' ? '    ' : (raw[i] ?? '');
    // A tab is four columns; spread it so column counting stays exact.
    for (const c of ch) out.push({ ch: c, bold, italic, underline, raw: i });
  }

  return out;
}

/** Collapses a line of styled characters into as few runs as possible. */
export function toRuns(chars: StyledChar[]): Run[] {
  const runs: Run[] = [];
  for (const c of chars) {
    const last = runs[runs.length - 1];
    if (last && !!last.bold === c.bold && !!last.italic === c.italic && !!last.underline === c.underline) {
      last.text += c.ch;
      continue;
    }
    const run: Run = { text: c.ch };
    if (c.bold) run.bold = true;
    if (c.italic) run.italic = true;
    if (c.underline) run.underline = true;
    runs.push(run);
  }
  return runs;
}

export interface WrappedLine {
  chars: StyledChar[];
  /** Offset into the element's raw source of the line's first character. */
  raw: number;
}

/**
 * Word-wraps styled text to a column width, in characters.
 *
 * Courier is monospaced, so a column is exactly N characters wide — no font
 * metrics are needed, and the screen and the PDF agree by construction.
 * Manual line breaks are respected. A word longer than a whole line is broken
 * hard rather than overflowing the margin.
 */
export function wrap(chars: StyledChar[], width: number): WrappedLine[] {
  const lines: WrappedLine[] = [];
  const max = Math.max(1, width);

  // Split on the writer's own line breaks first.
  const paragraphs: StyledChar[][] = [[]];
  for (const c of chars) {
    if (c.ch === '\n') paragraphs.push([]);
    else (paragraphs[paragraphs.length - 1] as StyledChar[]).push(c);
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push({ chars: [], raw: -1 });
      continue;
    }

    let start = 0;
    while (start < paragraph.length) {
      // Lines never begin with the space a wrap broke on.
      while (start < paragraph.length && paragraph[start]?.ch === ' ' && start > 0) start += 1;
      if (start >= paragraph.length) break;

      let end = Math.min(paragraph.length, start + max);
      if (end < paragraph.length) {
        // Back up to the last space so a word is never cut in half.
        let space = end;
        while (space > start && paragraph[space]?.ch !== ' ') space -= 1;
        if (space > start) end = space;
      }

      const slice = paragraph.slice(start, end);
      // Trailing spaces are invisible and would only confuse column maths.
      while (slice.length > 0 && slice[slice.length - 1]?.ch === ' ') slice.pop();
      lines.push({ chars: slice, raw: slice[0]?.raw ?? paragraph[start]?.raw ?? -1 });
      start = end;
    }
  }

  return lines;
}

export function plain(chars: StyledChar[]): string {
  return chars.map((c) => c.ch).join('');
}
