import type { InlineSpan } from './types';

/**
 * Inline markup: emphasis, notes, tags and escapes.
 *
 * Two spec rules shape this whole file:
 *
 * - **Emphasis never crosses a line break.** So emphasis is scanned per line,
 *   and a stray `*` can never run away and italicise the rest of the script.
 * - **Nothing looks past a double line break for its closing token** (the
 *   boneyard is the only exception, and it is handled before we get here). So
 *   a `[[` with no `]]` before the next blank line is just two brackets.
 *
 * Spans carry absolute document offsets so CodeMirror can decorate straight
 * from them.
 */

export interface InlineScan {
  spans: InlineSpan[];
  /** The text with markup removed — what the formatted page shows. */
  text: string;
}

/* ========================================================================== */
/* Escapes                                                                    */
/* ========================================================================== */

/**
 * Positions holding a backslash that escapes the next character.
 *
 * Computed up front so emphasis pairing can skip escaped delimiters without
 * rescanning. A doubled backslash escapes itself, so the second one is not
 * itself an escape.
 */
function escapePositions(text: string): Set<number> {
  const escapes = new Set<number>();
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\' && i + 1 < text.length) {
      escapes.add(i);
      i += 1; // The escaped character cannot start another escape.
    }
  }
  return escapes;
}

/* ========================================================================== */
/* Emphasis                                                                   */
/* ========================================================================== */

/** How many of `char` run consecutively starting at `i`. */
function runLength(line: string, i: number, char: string, escapes: Set<number>): number {
  let n = 0;
  while (i + n < line.length && line[i + n] === char && !escapes.has(i + n)) n += 1;
  return n;
}

function isSpace(ch: string | undefined): boolean {
  return ch === undefined || ch === ' ' || ch === '\t';
}

/**
 * Finds the delimiter run that closes one opened at `openEnd`.
 *
 * Fountain inherits Markdown's rule that the space around a delimiter decides
 * whether it opens or closes: a closer may not have whitespace immediately
 * before it. Without that, `4 * 3 * 2` would italicise.
 */
function findCloser(
  line: string,
  openEnd: number,
  char: string,
  len: number,
  escapes: Set<number>,
): number {
  for (let i = openEnd; i < line.length; i += 1) {
    if (line[i] !== char || escapes.has(i)) continue;

    const run = runLength(line, i, char, escapes);
    if (run < len) {
      i += run - 1;
      continue;
    }

    // A closer cannot be preceded by a space, and cannot be empty content.
    if (i === openEnd || isSpace(line[i - 1])) {
      i += run - 1;
      continue;
    }

    // For a longer run, the closing delimiter is its last `len` characters,
    // so `***a***` closes at the right place and `**a**` never eats a third.
    return i + run - len;
  }
  return -1;
}

const EMPHASIS: { char: string; lengths: number[] }[] = [
  { char: '*', lengths: [3, 2, 1] },
  { char: '_', lengths: [1] },
];

function spanTypeFor(char: string, len: number): InlineSpan['type'] {
  if (char === '_') return 'underline';
  if (len === 3) return 'boldItalic';
  if (len === 2) return 'bold';
  return 'italic';
}

/**
 * Scans one line for emphasis and escapes.
 *
 * Nested emphasis is supported — `_Steel's face FILLS the *Leupold Mark 4*
 * scope_` is in the spec — by recursing into each span's content.
 */
function scanLine(line: string, offset: number): InlineScan {
  const escapes = escapePositions(line);
  const spans: InlineSpan[] = [];
  let text = '';
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === '\\' && escapes.has(i)) {
      spans.push({
        type: 'escape',
        from: offset + i,
        to: offset + i + 2,
        contentFrom: offset + i + 1,
        contentTo: offset + i + 2,
      });
      text += line[i + 1] ?? '';
      i += 2;
      continue;
    }

    const rule = ch === undefined ? undefined : EMPHASIS.find((e) => e.char === ch);
    if (rule && !escapes.has(i)) {
      const available = runLength(line, i, rule.char, escapes);
      let matched = false;

      for (const len of rule.lengths) {
        if (len > available) continue;

        const openEnd = i + len;
        // An opener may not be followed by a space.
        if (isSpace(line[openEnd])) continue;

        const closeStart = findCloser(line, openEnd, rule.char, len, escapes);
        if (closeStart < 0) continue;

        const content = line.slice(openEnd, closeStart);
        const inner = scanLine(content, offset + openEnd);

        spans.push({
          type: spanTypeFor(rule.char, len),
          from: offset + i,
          to: offset + closeStart + len,
          contentFrom: offset + openEnd,
          contentTo: offset + closeStart,
        });
        spans.push(...inner.spans);

        text += inner.text;
        i = closeStart + len;
        matched = true;
        break;
      }

      if (matched) continue;
    }

    text += ch;
    i += 1;
  }

  return { spans, text };
}

/* ========================================================================== */
/* Notes and tags                                                             */
/* ========================================================================== */

export interface FoundNote {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  content: string;
  /** `[[#prop Revolver]]` — a production tag rather than a plain note. */
  isTag: boolean;
}

/**
 * Finds every `[[ … ]]` note in a chunk of source.
 *
 * Notes may contain single line breaks but not blank lines: nothing in
 * Fountain looks past a double line break for its closing token. An unclosed
 * `[[` is therefore just two literal brackets, which is what stops a typo
 * from swallowing the rest of a scene.
 */
export function findNotes(source: string, offset = 0): FoundNote[] {
  const notes: FoundNote[] = [];
  let i = 0;

  while (i < source.length - 1) {
    if (source[i] !== '[' || source[i + 1] !== '[') {
      i += 1;
      continue;
    }

    const contentFrom = i + 2;
    const close = source.indexOf(']]', contentFrom);
    if (close < 0) break;

    // A blank line between the brackets terminates the search, per the
    // double-line-break rule.
    const blank = findBlankLine(source, contentFrom, close);
    if (blank >= 0) {
      i += 2;
      continue;
    }

    const content = source.slice(contentFrom, close);
    notes.push({
      from: offset + i,
      to: offset + close + 2,
      contentFrom: offset + contentFrom,
      contentTo: offset + close,
      content,
      isTag: content.trimStart().startsWith('#'),
    });

    i = close + 2;
  }

  return notes;
}

/**
 * Offset of a blank line between `from` and `to`, or -1.
 *
 * A line counts as blank only if it is truly empty. Fountain gives two spaces
 * on an otherwise empty line a specific meaning — "keep this block together" —
 * so a two-space line must *not* terminate a note.
 */
function findBlankLine(source: string, from: number, to: number): number {
  let lineStart = from;
  for (let i = from; i < to; i += 1) {
    if (source[i] !== '\n') continue;
    if (i > lineStart) {
      const line = source.slice(lineStart, i);
      if (line.length > 0) {
        lineStart = i + 1;
        continue;
      }
    }
    if (i === lineStart) return i;
    lineStart = i + 1;
  }
  return -1;
}

/** Splits `[[#prop Revolver]]` into its kind and value. */
export function parseTag(content: string): { kind: string; value: string } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('#')) return null;

  const match = /^#([A-Za-z0-9_-]+)\s*(.*)$/s.exec(trimmed);
  if (!match) return null;

  return { kind: (match[1] ?? '').toLowerCase(), value: (match[2] ?? '').trim() };
}

/* ========================================================================== */
/* Entry point                                                                */
/* ========================================================================== */

/**
 * Scans a whole element's source for inline markup.
 *
 * Notes are removed from the display text — they belong in the margin, not in
 * the middle of an action line — but they stay in `spans` so the editor can
 * draw them and the serializer can put them back exactly.
 */
export function scanInline(raw: string, offset = 0): InlineScan {
  const notes = findNotes(raw, 0);
  const spans: InlineSpan[] = [];
  let text = '';
  let cursor = 0;

  for (const note of notes) {
    // Everything before this note gets the ordinary emphasis treatment.
    const before = raw.slice(cursor, note.from);
    const scanned = scanSegment(before, offset + cursor);
    spans.push(...scanned.spans);
    text += scanned.text;

    spans.push({
      type: note.isTag ? 'tag' : 'note',
      from: offset + note.from,
      to: offset + note.to,
      contentFrom: offset + note.contentFrom,
      contentTo: offset + note.contentTo,
    });

    cursor = note.to;
  }

  const rest = scanSegment(raw.slice(cursor), offset + cursor);
  spans.push(...rest.spans);
  text += rest.text;

  spans.sort((a, b) => a.from - b.from || b.to - a.to);

  return { spans, text };
}

/** Emphasis is per line, so a multi-line segment is scanned line by line. */
function scanSegment(segment: string, offset: number): InlineScan {
  const spans: InlineSpan[] = [];
  let text = '';
  let lineStart = 0;

  for (let i = 0; i <= segment.length; i += 1) {
    if (i < segment.length && segment[i] !== '\n') continue;

    const line = segment.slice(lineStart, i);
    const scanned = scanLine(line, offset + lineStart);
    spans.push(...scanned.spans);
    text += scanned.text;

    if (i < segment.length) text += '\n';
    lineStart = i + 1;
  }

  return { spans, text };
}
