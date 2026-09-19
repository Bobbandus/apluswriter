import type { CharacterElement, Element, Script, SceneHeadingElement } from '../fountain/types';
import { NUMBERED_HEADING_RE } from '../fountain/vocab';
import { CPI, ELEMENT_METRICS, MARGINS, PAGE_SIZES, linesPerPage, type PageSize } from './geometry';
import { plain, styledChars, toRuns, wrap, type Run, type StyledChar } from './text';

/**
 * The paginator.
 *
 * One engine, two consumers: the page view in the editor and the PDF
 * exporter both read its output. That is the only way to promise a writer
 * that page 47 on screen is page 47 on paper — neither renderer is allowed an
 * opinion about where a page ends.
 *
 * The rules are the industry's, in order of how badly breaking them reads:
 *
 * 1. A scene heading is never the last thing on a page. It moves to the next
 *    page with at least the first two lines of what follows it.
 * 2. A character cue is never separated from its dialogue.
 * 3. Dialogue that has to split gets `(MORE)` at the bottom and
 *    `NAME (CONT'D)` at the top of the next page. At least two lines stay on
 *    each side, and it prefers to break where a sentence ends.
 * 4. Action splits only at a sentence boundary, with at least two lines on
 *    each side. Otherwise it moves whole.
 *
 * Everything is counted in lines. Courier is monospaced and 12pt is exactly
 * six lines to the inch, so there are no font metrics to disagree about.
 */

/* ========================================================================== */
/* Output                                                                     */
/* ========================================================================== */

export type PageLineKind =
  | 'sceneHeading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'centered'
  | 'lyrics'
  | 'more'
  | 'contd';

export interface PageLine {
  kind: PageLineKind;
  runs: Run[];
  text: string;
  /** Left edge of the column, in inches from the paper edge. */
  indentIn: number;
  /** Column width, in inches. */
  widthIn: number;
  align: 'left' | 'right' | 'center';
  /** Index into `script.elements`, or -1 for a line the paginator made up. */
  element: number;
  /** Absolute source offset of the line's first visible character, or -1. */
  from: number;
  /** Printed in both margins when scene numbers are on. */
  sceneNumber?: string;
}

/**
 * One printed row. Usually a single line; two in dual dialogue, where the
 * speakers sit side by side. An empty array is a blank line.
 */
export type PageRow = PageLine[];

export interface Page {
  /** 1-based. Page 1 carries no printed number, by convention. */
  number: number;
  rows: PageRow[];
  /** Source offset of the first real line on the page, or -1 if none. */
  from: number;
}

export interface Pagination {
  pages: Page[];
  linesPerPage: number;
  /**
   * Length of each scene (indexed like `script.scenes`) in eighths of a page —
   * the unit production schedules are planned in.
   */
  sceneEighths: number[];
}

export interface PaginateOptions {
  pageSize: PageSize;
  /** `(MORE)` / `(MER)`. */
  moreLabel?: string;
  /** `(CONT'D)` / `(FORTS.)`. */
  contdLabel?: string;
  /** Print scene numbers; unnumbered scenes get their position. */
  sceneNumbers?: boolean;
  /** Overrides the body lines per page. For calibration tests only. */
  linesPerPage?: number;
}

/* ========================================================================== */
/* Blocks                                                                     */
/* ========================================================================== */

type BlockKind =
  | 'heading'
  | 'action'
  | 'dialogue'
  | 'dual'
  | 'transition'
  | 'centered'
  | 'lyrics'
  | 'blank'
  | 'break';

interface Block {
  kind: BlockKind;
  rows: PageRow[];
  /** Blank lines before this block, unless it opens a page. */
  spaceBefore: number;
  scene: number;
  /** Dialogue: the cue line, reused for the CONT'D cue after a split. */
  cue?: PageLine;
}

interface Column {
  indentIn: number;
  widthIn: number;
}

/** Columns for dual dialogue, derived from the page so A4 and Letter both fit. */
function dualColumns(size: PageSize): { left: Record<'cue' | 'paren' | 'text', Column>; right: Record<'cue' | 'paren' | 'text', Column> } {
  const content = PAGE_SIZES[size].widthIn - MARGINS.left - MARGINS.right;
  const gutter = 0.3;
  const col = (content - gutter) / 2;
  const make = (x: number) => ({
    cue: { indentIn: x + 0.8, widthIn: col - 0.8 },
    paren: { indentIn: x + 0.3, widthIn: col - 0.5 },
    text: { indentIn: x, widthIn: col },
  });
  return { left: make(MARGINS.left), right: make(MARGINS.left + col + gutter) };
}

function columnFor(kind: keyof typeof ELEMENT_METRICS, size: PageSize): Column {
  const metrics = ELEMENT_METRICS[kind];
  const pageWidth = PAGE_SIZES[size].widthIn;
  return {
    indentIn: metrics.indentIn,
    widthIn: metrics.widthIn ?? pageWidth - metrics.indentIn - MARGINS.right,
  };
}

/* ---------------------------------------------------------------- hiding */

type Range = [number, number];

/** Leading whitespace on every line of a multi-line raw, as hide ranges. */
function leadingSpaceRanges(raw: string): Range[] {
  const ranges: Range[] = [];
  let lineStart = 0;
  for (let i = 0; i <= raw.length; i += 1) {
    if (i < raw.length && raw[i] !== '\n') continue;
    const line = raw.slice(lineStart, i);
    const lead = /^[ \t]*/.exec(line)?.[0].length ?? 0;
    if (lead > 0) ranges.push([lineStart, lineStart + lead]);
    lineStart = i + 1;
  }
  return ranges;
}

/** A forcing character (and any spaces after it) at the start of the text. */
function forcingRange(raw: string, marker: string): Range | null {
  const lead = /^\s*/.exec(raw)?.[0].length ?? 0;
  if (raw[lead] !== marker) return null;
  const after = /^\s*/.exec(raw.slice(lead + 1))?.[0].length ?? 0;
  return [lead, lead + 1 + after];
}

function hideFor(element: Element): Range[] {
  const raw = element.raw;
  const ranges: Range[] = [];

  switch (element.type) {
    case 'sceneHeading': {
      ranges.push(...leadingSpaceRanges(raw));
      const lead = /^\s*/.exec(raw)?.[0].length ?? 0;
      let at = lead;
      if (raw[at] === '.' && raw[at + 1] !== '.') {
        ranges.push([at, at + 1]);
        at += 1;
      }
      // `2. INT. MATSAL - DAG`: the number is the scene number, not text.
      const numbered = NUMBERED_HEADING_RE.exec(raw.slice(at));
      if (numbered && (element as SceneHeadingElement).sceneNumber === numbered[1]) {
        ranges.push([at, at + numbered[0].length]);
      }
      // `#12A#` anywhere after the text, with the spaces before it.
      const tag = /\s*#[^#\n]+#/g;
      let m: RegExpExecArray | null;
      while ((m = tag.exec(raw))) ranges.push([m.index, m.index + m[0].length]);
      break;
    }

    case 'character': {
      ranges.push(...leadingSpaceRanges(raw));
      const forced = forcingRange(raw, '@');
      if (forced) ranges.push([forced[0], forced[0] + 1]);
      const caret = /\s*\^\s*$/.exec(raw);
      if (caret) ranges.push([caret.index, raw.length]);
      break;
    }

    case 'action': {
      const forced = forcingRange(raw, '!');
      if (forced) ranges.push([forced[0], forced[0] + 1]);
      break;
    }

    case 'transition': {
      ranges.push(...leadingSpaceRanges(raw));
      const forced = forcingRange(raw, '>');
      if (forced) ranges.push(forced);
      break;
    }

    case 'centered': {
      const forced = forcingRange(raw, '>');
      if (forced) ranges.push(forced);
      const close = /\s*<\s*$/.exec(raw);
      if (close) ranges.push([close.index, raw.length]);
      break;
    }

    case 'lyrics': {
      ranges.push(...leadingSpaceRanges(raw));
      const forced = forcingRange(raw, '~');
      if (forced) ranges.push([forced[0], forced[0] + 1]);
      break;
    }

    default:
      ranges.push(...leadingSpaceRanges(raw));
  }

  return ranges;
}

/* ---------------------------------------------------------------- lines */

function linesFor(
  element: Element,
  index: number,
  kind: PageLineKind,
  column: Column,
  align: PageLine['align'],
): PageLine[] {
  const chars = styledChars(element.raw, hideFor(element));
  const width = Math.floor(column.widthIn * CPI + 1e-9);

  return wrap(chars, width).map((wrapped) => ({
    kind,
    runs: toRuns(wrapped.chars),
    text: plain(wrapped.chars),
    indentIn: column.indentIn,
    widthIn: column.widthIn,
    align,
    element: index,
    from: wrapped.raw >= 0 ? element.from + wrapped.raw : -1,
  }));
}

function syntheticLine(kind: PageLineKind, text: string, column: Column): PageLine {
  return {
    kind,
    runs: [{ text }],
    text,
    indentIn: column.indentIn,
    widthIn: column.widthIn,
    align: 'left',
    element: -1,
    from: -1,
  };
}

const PRINTED_NOTHING = new Set(['section', 'synopsis', 'note', 'boneyard']);

/**
 * Turns the element list into blocks: the units the break rules act on.
 *
 * A cue and everything it says is one block, which is what keeps rule 2
 * (never separate a cue from its dialogue) a matter of structure rather than
 * of checking.
 */
function buildBlocks(script: Script, options: Required<PaginateOptions>): Block[] {
  const { pageSize: size } = options;
  const blocks: Block[] = [];
  const els = script.elements;

  const sceneStarts = script.scenes.map((scene) => scene.from);
  const sceneOf = (offset: number) => {
    let s = -1;
    for (let i = 0; i < sceneStarts.length; i += 1) {
      if (offset >= (sceneStarts[i] as number)) s = i;
      else break;
    }
    return s;
  };

  let sceneCounter = 0;

  for (let i = 0; i < els.length; i += 1) {
    const element = els[i] as Element;
    const scene = sceneOf(element.from);

    if (PRINTED_NOTHING.has(element.type)) continue;

    if (element.type === 'pageBreak') {
      blocks.push({ kind: 'break', rows: [], spaceBefore: 0, scene });
      continue;
    }

    // An empty action element is a blank line the writer asked for.
    if (element.type === 'action' && element.raw.trim().length === 0) {
      blocks.push({ kind: 'blank', rows: [[]], spaceBefore: 0, scene });
      continue;
    }

    if (element.type === 'sceneHeading') {
      sceneCounter += 1;
      const lines = linesFor(element, i, 'sceneHeading', columnFor('sceneHeading', size), 'left');
      const heading = element as SceneHeadingElement;
      const number = heading.sceneNumber ?? (options.sceneNumbers ? String(sceneCounter) : undefined);
      if (number && options.sceneNumbers && lines[0]) lines[0].sceneNumber = number;
      blocks.push({ kind: 'heading', rows: lines.map((l) => [l]), spaceBefore: 1, scene });
      continue;
    }

    if (element.type === 'character') {
      // Gather the whole speech: cue, then parentheticals and dialogue.
      const cueLines = linesFor(element, i, 'character', columnFor('character', size), 'left');
      const rows: PageRow[] = cueLines.map((l) => [l]);
      let j = i + 1;
      while (j < els.length) {
        const next = els[j] as Element;
        if (next.type === 'parenthetical') {
          rows.push(...linesFor(next, j, 'parenthetical', columnFor('parenthetical', size), 'left').map((l) => [l]));
        } else if (next.type === 'dialogue') {
          rows.push(...linesFor(next, j, 'dialogue', columnFor('dialogue', size), 'left').map((l) => [l]));
        } else {
          break;
        }
        j += 1;
      }

      const block: Block = { kind: 'dialogue', rows, spaceBefore: 1, scene, cue: cueLines[0] as PageLine };

      // Dual dialogue: this speech prints beside the previous one.
      const previous = blocks[blocks.length - 1];
      if ((element as CharacterElement).dual && previous?.kind === 'dialogue') {
        blocks[blocks.length - 1] = dualBlock(previous, els, i, j, size, scene);
      } else {
        blocks.push(block);
      }

      i = j - 1;
      continue;
    }

    if (element.type === 'transition') {
      const lines = linesFor(element, i, 'transition', columnFor('transition', size), 'right');
      blocks.push({ kind: 'transition', rows: lines.map((l) => [l]), spaceBefore: 1, scene });
      continue;
    }

    if (element.type === 'centered') {
      const lines = linesFor(element, i, 'centered', columnFor('centered', size), 'center');
      blocks.push({ kind: 'centered', rows: lines.map((l) => [l]), spaceBefore: 1, scene });
      continue;
    }

    if (element.type === 'lyrics') {
      const lines = linesFor(element, i, 'lyrics', columnFor('lyrics', size), 'left');
      const previous = blocks[blocks.length - 1];
      // Consecutive lyric lines are one song, not separate paragraphs.
      const space = previous?.kind === 'lyrics' || previous?.kind === 'dialogue' ? 0 : 1;
      blocks.push({ kind: 'lyrics', rows: lines.map((l) => [l]), spaceBefore: space, scene });
      continue;
    }

    // Action, and anything unrecognised — Fountain's own fallback.
    const lines = linesFor(element, i, 'action', columnFor('action', size), 'left');
    blocks.push({ kind: 'action', rows: lines.map((l) => [l]), spaceBefore: 1, scene });
  }

  return blocks;
}

/**
 * Rebuilds two consecutive speeches as side-by-side columns.
 *
 * The right-hand speech is the one marked with `^`; the left is the speech
 * just before it. Both are re-wrapped to the narrower column width.
 */
function dualBlock(
  left: Block,
  els: Element[],
  rightStart: number,
  rightEnd: number,
  size: PageSize,
  scene: number,
): Block {
  const columns = dualColumns(size);

  const layout = (start: number, end: number, side: typeof columns.left): PageLine[] => {
    const out: PageLine[] = [];
    for (let k = start; k < end; k += 1) {
      const el = els[k] as Element;
      const kind: PageLineKind =
        el.type === 'character' ? 'character' : el.type === 'parenthetical' ? 'parenthetical' : 'dialogue';
      const col = kind === 'character' ? side.cue : kind === 'parenthetical' ? side.paren : side.text;
      out.push(...linesFor(el, k, kind, col, 'left'));
    }
    return out;
  };

  // The left speech's element range: from its cue to just before the right cue.
  const leftStart = left.cue?.element ?? rightStart;
  const leftLines = layout(leftStart, rightStart, columns.left);
  const rightLines = layout(rightStart, rightEnd, columns.right);

  const rows: PageRow[] = [];
  for (let r = 0; r < Math.max(leftLines.length, rightLines.length); r += 1) {
    const row: PageLine[] = [];
    if (leftLines[r]) row.push(leftLines[r] as PageLine);
    if (rightLines[r]) row.push(rightLines[r] as PageLine);
    rows.push(row);
  }

  return { kind: 'dual', rows, spaceBefore: left.spaceBefore, scene };
}

/* ========================================================================== */
/* Splitting                                                                  */
/* ========================================================================== */

const SENTENCE_END = /[.!?…"'”’)\]]$/;

function endsSentence(row: PageRow | undefined): boolean {
  const text = row?.[0]?.text.trimEnd() ?? '';
  return SENTENCE_END.test(text) && !/\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|ca|bl\.a|t\.ex)\.$/i.test(text);
}

/**
 * Splits a speech across a page break, or returns null if it cannot.
 *
 * `room` is how many rows are left on the current page. The first part needs
 * the cue, at least two lines of speech, and the `(MORE)` line; the rest needs
 * at least two lines under its `(CONT'D)` cue.
 */
function splitDialogue(block: Block, room: number, options: Required<PaginateOptions>): [Block, Block] | null {
  const rows = block.rows;
  const cue = block.cue;
  if (!cue) return null;

  const minFirst = 3; // cue + two lines
  const maxK = Math.min(room - 1, rows.length - 2); // leave room for (MORE), and 2 lines after
  if (maxK < minFirst) return null;

  // Never end a page on a parenthetical — it belongs with the line it directs.
  const valid = (k: number) => rows[k - 1]?.[0]?.kind === 'dialogue';

  let chosen = -1;
  for (let k = maxK; k >= minFirst; k -= 1) {
    if (valid(k) && endsSentence(rows[k - 1])) {
      chosen = k;
      break;
    }
  }
  if (chosen < 0) {
    for (let k = maxK; k >= minFirst; k -= 1) {
      if (valid(k)) {
        chosen = k;
        break;
      }
    }
  }
  if (chosen < 0) return null;

  const cueColumn = { indentIn: cue.indentIn, widthIn: cue.widthIn };
  const more = syntheticLine('more', options.moreLabel, cueColumn);

  const alreadyContinued = /\((?:CONT'?D|FORTS\.?)\)/i.test(cue.text);
  const contdText = alreadyContinued ? cue.text : `${cue.text} ${options.contdLabel}`;
  const contd = { ...syntheticLine('contd', contdText, cueColumn), from: -1 };

  return [
    { ...block, rows: [...rows.slice(0, chosen), [more]] },
    { ...block, rows: [[contd], ...rows.slice(chosen)], spaceBefore: 0 },
  ];
}

/** Splits action at a sentence boundary, two lines each side, or null. */
function splitAction(block: Block, room: number): [Block, Block] | null {
  const rows = block.rows;
  const maxK = Math.min(room, rows.length - 2);
  for (let k = maxK; k >= 2; k -= 1) {
    if (endsSentence(rows[k - 1])) {
      return [
        { ...block, rows: rows.slice(0, k) },
        { ...block, rows: rows.slice(k), spaceBefore: 0 },
      ];
    }
  }
  return null;
}

/** Last resort for a block taller than a whole page: cut it where it must. */
function hardSplit(block: Block, room: number, options: Required<PaginateOptions>): [Block, Block] {
  if (block.kind === 'dialogue') {
    const split = splitDialogue(block, room, options);
    if (split) return split;
  }
  const k = Math.max(1, room);
  return [
    { ...block, rows: block.rows.slice(0, k) },
    { ...block, rows: block.rows.slice(k), spaceBefore: 0 },
  ];
}

/* ========================================================================== */
/* Pagination                                                                 */
/* ========================================================================== */

export function paginate(script: Script, options: PaginateOptions): Pagination {
  const opts: Required<PaginateOptions> = {
    moreLabel: '(MORE)',
    contdLabel: "(CONT'D)",
    sceneNumbers: false,
    linesPerPage: 0,
    ...options,
  };

  const L = opts.linesPerPage > 0 ? opts.linesPerPage : linesPerPage(opts.pageSize);
  const queue = buildBlocks(script, opts);
  const pages: Page[] = [];
  const sceneRows = new Array<number>(script.scenes.length).fill(0);

  let rows: PageRow[] = [];

  const finishPage = () => {
    // Trailing blank rows are never printed; they would only push the page
    // count for nothing.
    while (rows.length > 0 && (rows[rows.length - 1] as PageRow).length === 0) rows.pop();
    if (rows.length === 0 && pages.length > 0) return;
    const first = rows.flat().find((line) => line.from >= 0);
    pages.push({ number: pages.length + 1, rows, from: first?.from ?? -1 });
    rows = [];
  };

  const place = (block: Block, space: number) => {
    for (let s = 0; s < space; s += 1) rows.push([]);
    rows.push(...block.rows);
    if (block.scene >= 0) sceneRows[block.scene] = (sceneRows[block.scene] ?? 0) + space + block.rows.length;
  };

  /** The next block that will actually print something. */
  const peekPrinted = (from: number): Block | undefined => {
    for (let k = from; k < queue.length; k += 1) {
      const candidate = queue[k] as Block;
      if (candidate.kind !== 'blank') return candidate;
    }
    return undefined;
  };

  for (let i = 0; i < queue.length; i += 1) {
    const block = queue[i] as Block;
    const used = rows.length;

    if (block.kind === 'break') {
      if (used > 0) finishPage();
      continue;
    }

    if (block.kind === 'blank') {
      // A blank line at the top of a page is not a line anyone asked for.
      if (used > 0 && used < L) {
        rows.push([]);
        if (block.scene >= 0) sceneRows[block.scene] = (sceneRows[block.scene] ?? 0) + 1;
      }
      continue;
    }

    const space = used > 0 ? block.spaceBefore : 0;
    const need = space + block.rows.length;

    if (block.kind === 'heading') {
      // Rule 1: a heading takes at least two lines of what follows with it.
      const next = peekPrinted(i + 1);
      const tail = next && next.kind !== 'heading' && next.kind !== 'break'
        ? next.spaceBefore + Math.min(2, next.rows.length)
        : 0;
      if (used > 0 && used + need + tail > L) {
        finishPage();
        place(block, 0);
      } else {
        place(block, space);
      }
      continue;
    }

    if (used + need <= L) {
      place(block, space);
      continue;
    }

    // It does not fit. Try to split it across the break.
    const room = L - used - space;
    const split =
      block.kind === 'dialogue'
        ? splitDialogue(block, room, opts)
        : block.kind === 'action'
          ? splitAction(block, room)
          : null;

    if (split && used > 0) {
      place(split[0], space);
      finishPage();
      queue.splice(i + 1, 0, split[1]);
      continue;
    }

    if (used > 0) {
      // Move it whole to a fresh page, then look at it again from there.
      finishPage();
      i -= 1;
      continue;
    }

    // Taller than an entire page even on its own — cut where it must.
    const [first, rest] = hardSplit(block, L, opts);
    place(first, 0);
    finishPage();
    if (rest.rows.length > 0) queue.splice(i + 1, 0, rest);
  }

  finishPage();

  return {
    pages,
    linesPerPage: L,
    sceneEighths: sceneRows.map((count) => (count > 0 ? Math.max(1, Math.ceil((count / L) * 8)) : 0)),
  };
}

/** Formats eighths the way a schedule does: `1 3/8`, `4/8`, `2`. */
export function formatEighths(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (rest === 0) return String(whole);
  return whole > 0 ? `${whole} ${rest}/8` : `${rest}/8`;
}

export type { StyledChar };
