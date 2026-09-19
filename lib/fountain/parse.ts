import { findNotes, scanInline } from './inline';
import {
  NUMBERED_HEADING_RE,
  SCENE_NUMBER_RE,
  SCENE_PREFIX_RE,
  TOD_SEPARATOR_RE,
  TRANSITION_RE,
  isTimeOfDay,
} from './vocab';
import type {
  Element,
  SceneMeta,
  Script,
  TitlePage,
  TitlePageField,
} from './types';
import { buildIndexes } from './indexes';
import { readSceneMeta } from './plus';

/**
 * The Fountain 1.1 + A+ parser.
 *
 * Reading order, and why it is this order:
 *
 * 1. **Boneyard first.** `/* … *​/` is the one construct that may span blank
 *    lines, so it has to be lifted out before anything else counts lines.
 * 2. **Title page second.** It is only a title page if it is at the very top;
 *    once the body starts, `Fade in:` is a transition, not a key/value pair.
 * 3. **Then blocks.** Everything else in Fountain is decided by the blank
 *    lines around it, so the block — a run of lines between blank lines — is
 *    the natural unit, and the natural unit for incremental re-parsing too.
 *
 * When a line cannot be classified it becomes Action. That is the spec's own
 * instruction and it is the right one: showing a writer what they wrote in the
 * wrong format beats silently dropping it.
 */

/* ========================================================================== */
/* Lines                                                                      */
/* ========================================================================== */

interface Line {
  /** Content without the newline. A trailing `\r` is kept in `raw` only. */
  text: string;
  raw: string;
  from: number;
  to: number;
  index: number;
}

function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  let index = 0;

  for (let i = 0; i <= source.length; i += 1) {
    if (i < source.length && source[i] !== '\n') continue;

    const raw = source.slice(start, i);
    lines.push({
      raw,
      // CRLF files are common from Windows and from Final Draft exports;
      // the `\r` is stripped for classification but left in the offsets.
      text: raw.endsWith('\r') ? raw.slice(0, -1) : raw,
      from: start,
      to: i,
      index,
    });

    index += 1;
    start = i + 1;
  }

  return lines;
}

/** Truly empty. A line of two spaces is *not* blank — see `isBlank` below. */
function isBlank(line: Line): boolean {
  // Fountain gives two spaces on an otherwise empty line a meaning: "this
  // block continues". So only a genuinely empty line separates blocks.
  return line.text.length === 0;
}

/* ========================================================================== */
/* Boneyard                                                                   */
/* ========================================================================== */

interface Range {
  from: number;
  to: number;
}

/**
 * Finds every `/* … *​/` pair.
 *
 * The boneyard is explicitly the exception to the double-line-break rule: a
 * pair may swallow as much of the script as the writer likes. An unterminated
 * `/*` runs to the end of the document, which is what lets a writer comment
 * out a whole act by typing two characters.
 */
function extractBoneyards(source: string): Range[] {
  const ranges: Range[] = [];
  let i = 0;

  while (i < source.length - 1) {
    if (source[i] !== '/' || source[i + 1] !== '*') {
      i += 1;
      continue;
    }

    const close = source.indexOf('*/', i + 2);
    const to = close < 0 ? source.length : close + 2;
    ranges.push({ from: i, to });
    i = to;
  }

  return ranges;
}

/* ========================================================================== */
/* Title page                                                                 */
/* ========================================================================== */

const TITLE_KEY_RE = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _-]*):\s*(.*)$/;

/**
 * Keys that make a block at the top of a file an actual title page.
 *
 * Unknown keys are kept as metadata — the spec asks for that — but at least
 * one *known* key has to be present, because otherwise a script opening on
 * `CUT TO:` or `FADE IN:` gets swallowed whole: both match `key: value`
 * perfectly, and the entire first block silently stops being script.
 *
 * Swedish keys sit alongside the English ones for the same reason they do
 * everywhere else in the app.
 */
const KNOWN_TITLE_KEYS = new Set([
  'title',
  'credit',
  'author',
  'authors',
  'source',
  'draft date',
  'date',
  'contact',
  'copyright',
  'notes',
  'revision',
  // Swedish
  'titel',
  'författare',
  'manus',
  'källa',
  'kontakt',
  'datum',
  'utkast',
  'upphovsrätt',
]);

/** A continuation line: indented by a tab or three or more spaces. */
function isIndented(text: string): boolean {
  return /^(\t| {3,})/.test(text);
}

/**
 * Parses the title page, if there is one.
 *
 * Returns the index of the first body line. The title page ends at the first
 * blank line — everything after that is script, including lines that happen to
 * contain a colon.
 */
function parseTitlePage(lines: Line[]): { titlePage: TitlePage | null; bodyStart: number } {
  const first = lines[0];
  if (!first || isBlank(first) || !TITLE_KEY_RE.test(first.text)) {
    return { titlePage: null, bodyStart: 0 };
  }

  const fields: TitlePageField[] = [];
  let i = 0;
  let current: TitlePageField | null = null;

  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || isBlank(line)) break;

    const match = !isIndented(line.text) ? TITLE_KEY_RE.exec(line.text) : null;

    if (match) {
      if (current) fields.push(current);
      const rawKey = match[1] ?? '';
      const inline = (match[2] ?? '').trim();
      current = {
        key: rawKey.trim().toLowerCase().replace(/\s+/g, ' '),
        rawKey,
        values: inline ? [inline] : [],
        from: line.from,
        to: line.to,
      };
    } else if (current) {
      // An indented line continues the value above it.
      current.values.push(line.text.trim());
      current.to = line.to;
    } else {
      break;
    }
  }

  if (current) fields.push(current);
  if (fields.length === 0) return { titlePage: null, bodyStart: 0 };
  if (!fields.some((field) => KNOWN_TITLE_KEYS.has(field.key))) {
    return { titlePage: null, bodyStart: 0 };
  }

  const last = fields[fields.length - 1];
  const titlePage: TitlePage = {
    fields,
    from: fields[0]?.from ?? 0,
    to: last?.to ?? 0,
  };

  // Skip the blank line that closed the title page.
  while (i < lines.length && isBlank(lines[i] as Line)) i += 1;

  return { titlePage, bodyStart: i };
}

/* ========================================================================== */
/* Line-level recognition                                                     */
/* ========================================================================== */

const EXTENSION_RE = /\s*\([^()]*\)\s*$/;

interface CharacterParts {
  name: string;
  extensions: string[];
  dual: boolean;
  forced: boolean;
}

/** Splits a cue into its name, extensions and dual-dialogue marker. */
export function splitCharacter(text: string): CharacterParts {
  let s = text.trim();
  let forced = false;

  if (s.startsWith('@')) {
    forced = true;
    s = s.slice(1);
  }

  let dual = false;
  // "Any number of spaces between the Character name and the caret are
  // acceptable, and will be ignored."
  if (s.trimEnd().endsWith('^')) {
    dual = true;
    s = s.trimEnd().slice(0, -1);
  }

  const extensions: string[] = [];
  for (;;) {
    const match = EXTENSION_RE.exec(s);
    if (!match) break;
    extensions.unshift(match[0].trim());
    s = s.slice(0, match.index);
  }

  return { name: s.trim(), extensions, dual, forced };
}

const HAS_LETTER_RE = /\p{L}/u;

/**
 * Is this line a character cue?
 *
 * "Any line entirely in uppercase … must contain at least one alphabetical
 * character" — so `R2D2` is a cue and `23` is not. Extensions are excluded
 * before the test, because `(on the radio)` is allowed to be lowercase.
 */
function isCharacterLine(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith('@')) return true; // Forced — case no longer matters.

  const { name } = splitCharacter(trimmed);
  if (name.length === 0) return false;
  if (!HAS_LETTER_RE.test(name)) return false;

  return name === name.toUpperCase();
}

function isParentheticalLine(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('(') && trimmed.endsWith(')') && trimmed.length >= 2;
}

function isSceneHeadingLine(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // A forced heading, but `...` is an ellipsis, not a heading.
  if (trimmed.startsWith('.') && !trimmed.startsWith('..')) return true;

  const withoutNumber = trimmed.replace(NUMBERED_HEADING_RE, '');
  return SCENE_PREFIX_RE.test(withoutNumber);
}

/**
 * Takes the line with its *trailing* whitespace intact.
 *
 * Leading indentation is ignored — "tabs do not hint formatting to Fountain" —
 * but a space after the colon is the spec's own escape hatch: it is how a
 * writer says that `JACK TURNS TO: ` is a line of action, not a transition.
 */
function isTransitionLine(text: string): boolean {
  const s = text.replace(/^\s+/, '');
  if (s.length === 0) return false;
  if (s.startsWith('>') && !s.trimEnd().endsWith('<')) return true;
  if (!HAS_LETTER_RE.test(s)) return false;
  return TRANSITION_RE.test(s);
}

function isCenteredLine(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('>') && trimmed.endsWith('<') && trimmed.length >= 2;
}

/** Removes every `[[ … ]]` note, leaving the text around them. */
function stripNotes(text: string): string {
  const notes = findNotes(text);
  let out = text;
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const note = notes[i];
    if (!note) continue;
    out = out.slice(0, note.from) + out.slice(note.to);
  }
  return out;
}

/** A line that is nothing but notes contributes metadata, not script. */
function isNoteOnlyLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[[')) return false;
  if (findNotes(trimmed).length === 0) return false;
  return stripNotes(trimmed).trim().length === 0;
}

/* ========================================================================== */
/* Scene headings                                                             */
/* ========================================================================== */

export interface ParsedHeading {
  prefix: string | null;
  location: string;
  timeOfDay: string | null;
  sceneNumber: string | null;
  forced: boolean;
}

/**
 * Pulls a scene heading apart.
 *
 * The time of day is only split off when it is a word we recognise. Splitting
 * blindly on the last dash — the usual shortcut — turns `INT. HOUSE - KITCHEN`
 * into a scene at "HOUSE" at time of day "KITCHEN", and every location report
 * built on it is then wrong.
 */
export function parseHeading(text: string): ParsedHeading {
  // Metadata notes live on the heading line, so they have to come off before
  // anything else — otherwise `[[id: s_8f2k]]` ends up inside the location and
  // the scene files itself under a name no one typed.
  let s = stripNotes(text).trim();
  let forced = false;
  let sceneNumber: string | null = null;

  if (s.startsWith('.') && !s.startsWith('..')) {
    forced = true;
    s = s.slice(1).trim();
  }

  // `2. INT. MATSAL - DAG` — lift the number out and keep it as the scene
  // number, which is what the writer meant by it.
  const numbered = NUMBERED_HEADING_RE.exec(s);
  if (numbered && SCENE_PREFIX_RE.test(s.slice(numbered[0].length))) {
    sceneNumber = numbered[1] ?? null;
    s = s.slice(numbered[0].length);
  }

  // A trailing `#12A#` wins over a leading number.
  const numberMatch = SCENE_NUMBER_RE.exec(s);
  if (numberMatch) {
    sceneNumber = (numberMatch[1] ?? '').trim();
    s = s.slice(0, numberMatch.index).trimEnd();
  }

  let prefix: string | null = null;
  const prefixMatch = SCENE_PREFIX_RE.exec(s);
  if (prefixMatch) {
    prefix = (prefixMatch[0] ?? '').toUpperCase().replace(/\s+/g, '');
    s = s.slice(prefixMatch[0].length).replace(/^[.\s]+/, '');
  }

  let location = s.trim();
  let timeOfDay: string | null = null;

  // Walk the separators from the right; the first recognised tail wins.
  const separators = [...location.matchAll(TOD_SEPARATOR_RE)];
  const last = separators[separators.length - 1];
  if (last?.index !== undefined) {
    const tail = location.slice(last.index + last[0].length).trim();
    if (isTimeOfDay(tail)) {
      timeOfDay = tail.toUpperCase();
      location = location.slice(0, last.index).trim();
    }
  }

  return { prefix, location, timeOfDay, sceneNumber, forced };
}

/* ========================================================================== */
/* Block classification                                                       */
/* ========================================================================== */

let idCounter = 0;
function nextId(type: string): string {
  idCounter += 1;
  return `${type[0]}${idCounter.toString(36)}`;
}

/** Resets the id counter. Only used by tests that assert on ids. */
export function __resetIds(): void {
  idCounter = 0;
}

interface Builder {
  elements: Element[];
  source: string;
}

function makeElement<T extends Element>(
  type: T['type'],
  lines: Line[],
  source: string,
  displayText: string,
  extra: Record<string, unknown> = {},
): T {
  const first = lines[0] as Line;
  const last = lines[lines.length - 1] as Line;
  const raw = source.slice(first.from, last.to);
  const scan = scanInline(raw, first.from);

  return {
    id: nextId(type),
    type,
    from: first.from,
    to: last.to,
    lineStart: first.index,
    lineEnd: last.index,
    raw,
    text: displayText,
    spans: scan.spans,
    ...extra,
  } as T;
}

/** Tabs count as four spaces, and leading whitespace survives in Action. */
function actionText(lines: Line[]): string {
  return lines.map((l) => l.text.replace(/\t/g, '    ')).join('\n');
}

/** The display text of a line once notes and emphasis markup are removed. */
function cleanText(text: string): string {
  return scanInline(text).text;
}

/**
 * Classifies one block — a run of non-blank lines.
 *
 * The block is walked with a tiny state machine rather than being labelled as
 * a whole, because one block legitimately holds a cue, a parenthetical and
 * several lines of dialogue.
 */
function classifyBlock(lines: Line[], source: string, out: Element[]): void {
  let i = 0;
  let pendingAction: Line[] = [];
  let speaker: string | null = null;

  const flushAction = () => {
    if (pendingAction.length === 0) return;
    const forced = (pendingAction[0] as Line).text.trimStart().startsWith('!');
    const text = actionText(pendingAction);
    out.push(
      makeElement(
        'action',
        pendingAction,
        source,
        cleanText(forced ? text.replace(/^(\s*)!/, '$1') : text),
        { forced },
      ),
    );
    pendingAction = [];
  };

  while (i < lines.length) {
    const line = lines[i] as Line;
    const text = line.text;
    const trimmed = text.trim();
    const isLast = i === lines.length - 1;

    /* ---- inside a dialogue run ---- */
    if (speaker !== null) {
      if (isParentheticalLine(trimmed)) {
        out.push(
          makeElement('parenthetical', [line], source, cleanText(trimmed), { character: speaker }),
        );
        i += 1;
        continue;
      }

      // Everything else in the block belongs to the speaker, manual line
      // breaks and all — so the run is gathered until the block ends or a
      // parenthetical interrupts it.
      const run: Line[] = [];
      while (i < lines.length && !isParentheticalLine((lines[i] as Line).text.trim())) {
        run.push(lines[i] as Line);
        i += 1;
      }
      out.push(
        makeElement('dialogue', run, source, cleanText(run.map((l) => l.text).join('\n')), {
          character: speaker,
        }),
      );
      continue;
    }

    /* ---- forced action wins over everything ---- */
    if (trimmed.startsWith('!')) {
      pendingAction.push(line);
      i += 1;
      continue;
    }

    /* ---- single-line constructs ---- */
    if (/^={3,}\s*$/.test(trimmed)) {
      flushAction();
      out.push(makeElement('pageBreak', [line], source, ''));
      i += 1;
      continue;
    }

    if (trimmed.startsWith('#')) {
      flushAction();
      const depth = /^#+/.exec(trimmed)?.[0].length ?? 1;
      out.push(
        makeElement('section', [line], source, cleanText(trimmed.replace(/^#+\s*/, '')), { depth }),
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('=') && !/^={3,}/.test(trimmed)) {
      flushAction();
      out.push(makeElement('synopsis', [line], source, cleanText(trimmed.replace(/^=\s*/, ''))));
      i += 1;
      continue;
    }

    if (trimmed.startsWith('~')) {
      flushAction();
      out.push(makeElement('lyrics', [line], source, cleanText(trimmed.slice(1).trim())));
      i += 1;
      continue;
    }

    if (isCenteredLine(trimmed)) {
      flushAction();
      out.push(
        makeElement('centered', [line], source, cleanText(trimmed.slice(1, -1).trim())),
      );
      i += 1;
      continue;
    }

    if (isNoteOnlyLine(trimmed)) {
      flushAction();
      out.push(makeElement('note', [line], source, cleanText(trimmed)));
      i += 1;
      continue;
    }

    if (isSceneHeadingLine(trimmed)) {
      flushAction();
      const parsed = parseHeading(trimmed);
      out.push(
        makeElement('sceneHeading', [line], source, cleanText(trimmed.replace(/^\./, '')), {
          ...parsed,
          meta: {} as SceneMeta,
        }),
      );
      i += 1;
      continue;
    }

    if (isTransitionLine(text)) {
      flushAction();
      const forced = trimmed.startsWith('>');
      out.push(
        makeElement('transition', [line], source, cleanText(forced ? trimmed.slice(1).trim() : trimmed), {
          forced,
        }),
      );
      i += 1;
      continue;
    }

    /* ---- a cue, but only if something follows it in this block ---- */
    // "…without an empty line after it". A lone uppercase line in its own
    // block is Action, which is why SCREAMING one word does not create a
    // character called SCREAMING.
    if (isCharacterLine(trimmed) && (!isLast || trimmed.startsWith('@'))) {
      flushAction();
      const parts = splitCharacter(trimmed);
      out.push(
        makeElement('character', [line], source, cleanText(parts.name), {
          name: parts.name.toUpperCase(),
          extensions: parts.extensions,
          dual: parts.dual,
          forced: parts.forced,
        }),
      );
      speaker = parts.name.toUpperCase();
      i += 1;
      continue;
    }

    pendingAction.push(line);
    i += 1;
  }

  flushAction();
}

/* ========================================================================== */
/* Entry point                                                                */
/* ========================================================================== */

export function parse(source: string): Script {
  __resetIds();

  const boneyards = extractBoneyards(source);
  const elements: Element[] = [];

  /* Everything outside a boneyard is parsed normally; the boneyards
     themselves become elements so they round-trip and can be shown collapsed. */
  const segments: Range[] = [];
  let cursor = 0;
  for (const yard of boneyards) {
    if (yard.from > cursor) segments.push({ from: cursor, to: yard.from });
    cursor = yard.to;
  }
  if (cursor < source.length) segments.push({ from: cursor, to: source.length });

  const work: { kind: 'text' | 'boneyard'; range: Range }[] = [
    ...segments.map((range) => ({ kind: 'text' as const, range })),
    ...boneyards.map((range) => ({ kind: 'boneyard' as const, range })),
  ].sort((a, b) => a.range.from - b.range.from);

  let titlePage: TitlePage | null = null;
  let titleDone = false;

  for (const item of work) {
    if (item.kind === 'boneyard') {
      const raw = source.slice(item.range.from, item.range.to);
      elements.push({
        id: nextId('boneyard'),
        type: 'boneyard',
        from: item.range.from,
        to: item.range.to,
        lineStart: countLines(source, item.range.from),
        lineEnd: countLines(source, item.range.to),
        raw,
        text: raw.replace(/^\/\*/, '').replace(/\*\/$/, ''),
        spans: [],
      });
      continue;
    }

    const chunk = source.slice(item.range.from, item.range.to);
    const lines = splitLines(chunk).map((line) => ({
      ...line,
      from: line.from + item.range.from,
      to: line.to + item.range.from,
      index: line.index + countLines(source, item.range.from),
    }));

    let start = 0;
    if (!titleDone) {
      titleDone = true;
      const result = parseTitlePage(lines);
      titlePage = result.titlePage;
      start = result.bodyStart;
    }

    /* Split into blocks on blank lines.

       One blank line is a separator. Fountain takes "every carriage return as
       intentional", so blank lines *beyond* the first are the writer's
       deliberate spacing and survive as empty Action elements — but only
       between two blocks. A trailing run at the end of a chunk is just how the
       file ends, and emitting elements for it would put phantom blank lines
       into the script on every save. */
    let blockStart = -1;
    let blankRun: Line[] = [];
    let seenBlock = false;

    for (let i = start; i <= lines.length; i += 1) {
      const atEnd = i === lines.length;
      const line = lines[i];
      const blank = atEnd || isBlank(line as Line);

      if (!blank) {
        if (blockStart < 0) {
          if (seenBlock) {
            for (const extra of blankRun.slice(1)) {
              elements.push(makeElement('action', [extra], source, '', { forced: false }));
            }
          }
          blankRun = [];
          blockStart = i;
        }
        continue;
      }

      if (blockStart >= 0) {
        classifyBlock(lines.slice(blockStart, i), source, elements);
        blockStart = -1;
        seenBlock = true;
        blankRun = line ? [line] : [];
      } else if (line) {
        blankRun.push(line);
      }
    }
  }

  elements.sort((a, b) => a.from - b.from);

  attachSceneMeta(elements);

  const indexes = buildIndexes(elements);

  return { source, titlePage, elements, ...indexes };
}

function countLines(source: string, offset: number): number {
  let count = 0;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') count += 1;
  }
  return count;
}

/**
 * Hangs Fountain+ metadata off each scene heading.
 *
 * Metadata is any note on the heading line itself, or on the note-only lines
 * directly below it before the scene's first real element. Putting it in notes
 * is what keeps these files readable in Highland and Final Draft — they see
 * notes and ignore them.
 */
function attachSceneMeta(elements: Element[]): void {
  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i];
    if (element?.type !== 'sceneHeading') continue;

    const sources: string[] = [element.raw];
    for (let j = i + 1; j < elements.length; j += 1) {
      const next = elements[j];
      if (next?.type !== 'note') break;
      sources.push(next.raw);
    }

    element.meta = readSceneMeta(sources.join('\n'));
  }
}
