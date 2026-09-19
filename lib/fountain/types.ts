/**
 * The Fountain+ abstract syntax tree.
 *
 * Two rules govern everything in this file:
 *
 * 1. **Offsets are absolute and into the original document.** Every element
 *    and span carries `from`/`to` that index the exact source string that was
 *    parsed. That is what lets CodeMirror hang decorations off the AST without
 *    a second mapping layer, and what makes `serialize(parse(x)) === x`
 *    checkable byte for byte.
 *
 * 2. **Nothing is thrown away.** `raw` keeps the source including markup;
 *    `text` is the same content with markup removed for display. An element we
 *    cannot classify becomes Action rather than disappearing — the spec's own
 *    rule, and the right one: better to show the writer what they wrote in the
 *    wrong format than to skip over it.
 */

export type ElementType =
  | 'sceneHeading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'lyrics'
  | 'section'
  | 'synopsis'
  | 'pageBreak'
  | 'boneyard'
  | 'note';

/* ========================================================================== */
/* Inline spans                                                               */
/* ========================================================================== */

export type SpanType =
  | 'bold'
  | 'italic'
  | 'boldItalic'
  | 'underline'
  | 'note'
  | 'tag'
  | 'escape';

/**
 * A run of inline markup inside an element.
 *
 * `from`/`to` cover the whole construct including its delimiters, so a
 * decoration can hide the markers and style the content. `contentFrom`/
 * `contentTo` cover just the part the reader sees.
 */
export interface InlineSpan {
  type: SpanType;
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
}

/* ========================================================================== */
/* Fountain+ scene metadata                                                   */
/* ========================================================================== */

export type SceneColor =
  | 'none'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'gray';

export type SceneStatus = 'draft' | 'revised' | 'locked';

/** A production tag: `[[#prop Revolver]]`. */
export interface SceneTag {
  /** `prop`, `sfx`, `wardrobe`, … — lowercased. */
  kind: string;
  value: string;
  from: number;
  to: number;
}

/**
 * Everything A+ Write knows about a scene beyond its heading.
 *
 * All of it is stored in the document inside Fountain notes, so a file written
 * here opens cleanly in Highland or Final Draft — they see notes and ignore
 * them. Nothing here changes how the script reads.
 */
export interface SceneMeta {
  /** From `[[id: s_8f2k]]`. Survives reorders, renames and revisions. */
  sceneId?: string;
  /** From `[[CAST: Vilde, Noa-Li]]`. */
  cast?: string[];
  /** From `[[LOCATION: Skolmatsal. Statister i orange overaller.]]`. */
  locationNote?: string;
  color?: SceneColor;
  status?: SceneStatus;
  /** From `[[beat: Midpoint]]`. */
  beat?: string;
  tags?: SceneTag[];
  /** From `[[todo: fix this line]]`. */
  todos?: string[];
}

/* ========================================================================== */
/* Elements                                                                   */
/* ========================================================================== */

export interface BaseElement {
  /**
   * Stable across incremental re-parses. Splicing a block keeps the ids of
   * elements that did not change, so decorations and the scene index do not
   * churn on every keystroke.
   */
  id: string;
  type: ElementType;
  /** Absolute offsets into the source document. */
  from: number;
  to: number;
  /** 0-based line numbers, inclusive. */
  lineStart: number;
  lineEnd: number;
  /** Source text exactly as written, markup included. */
  raw: string;
  /** Display text: forcing characters and markup removed. */
  text: string;
  /** Inline markup found in `raw`, at absolute offsets. */
  spans: InlineSpan[];
}

export interface SceneHeadingElement extends BaseElement {
  type: 'sceneHeading';
  /** `INT`, `EXT`, `EST`, `INT./EXT`, `I/E` … as written, uppercased. */
  prefix: string | null;
  location: string;
  timeOfDay: string | null;
  /** From `#12A#`, or lifted out of a numbered heading like `2. INT. …`. */
  sceneNumber: string | null;
  /** True when written with a leading `.` rather than a recognised prefix. */
  forced: boolean;
  meta: SceneMeta;
}

export interface CharacterElement extends BaseElement {
  type: 'character';
  /** Without extensions, without the `@`, without the `^`. */
  name: string;
  /** `(V.O.)`, `(CONT'D)`, `(on the radio)` — as written. */
  extensions: string[];
  /** Marked with a trailing `^`: this cue prints beside the previous one. */
  dual: boolean;
  /** Written with `@` to preserve mixed case or non-Latin letters. */
  forced: boolean;
}

export interface DialogueElement extends BaseElement {
  type: 'dialogue';
  /** The character this line belongs to, resolved at parse time. */
  character: string;
}

export interface ParentheticalElement extends BaseElement {
  type: 'parenthetical';
  character: string;
}

export interface TransitionElement extends BaseElement {
  type: 'transition';
  forced: boolean;
}

export interface SectionElement extends BaseElement {
  type: 'section';
  /** 1 for `#`, 2 for `##`, and so on. */
  depth: number;
}

export interface ActionElement extends BaseElement {
  type: 'action';
  forced: boolean;
}

export interface LyricsElement extends BaseElement {
  type: 'lyrics';
}

export interface CenteredElement extends BaseElement {
  type: 'centered';
}

export interface SynopsisElement extends BaseElement {
  type: 'synopsis';
}

export interface PageBreakElement extends BaseElement {
  type: 'pageBreak';
}

/** `/* … *​/` — kept in the tree so it round-trips, hidden when rendering. */
export interface BoneyardElement extends BaseElement {
  type: 'boneyard';
}

/** A `[[ … ]]` note standing on its own, rather than inline in another element. */
export interface NoteElement extends BaseElement {
  type: 'note';
}

export type Element =
  | SceneHeadingElement
  | ActionElement
  | CharacterElement
  | DialogueElement
  | ParentheticalElement
  | TransitionElement
  | CenteredElement
  | LyricsElement
  | SectionElement
  | SynopsisElement
  | PageBreakElement
  | BoneyardElement
  | NoteElement;

/* ========================================================================== */
/* Title page                                                                 */
/* ========================================================================== */

export interface TitlePageField {
  /** Lowercased and space-normalised: `draft date`, `title`, `contact`. */
  key: string;
  /** As written, for round-tripping. */
  rawKey: string;
  /** One entry per line; indented continuation lines become extra entries. */
  values: string[];
  from: number;
  to: number;
}

export interface TitlePage {
  fields: TitlePageField[];
  from: number;
  to: number;
}

/* ========================================================================== */
/* Derived indexes                                                            */
/* ========================================================================== */

/** One scene: its heading plus everything up to the next heading. */
export interface SceneIndexEntry {
  /** The stable `[[id:]]`, or a generated one if the document has none yet. */
  id: string;
  /** Index into `Script.elements` of the heading. */
  elementIndex: number;
  sceneNumber: string | null;
  heading: string;
  location: string;
  timeOfDay: string | null;
  prefix: string | null;
  from: number;
  to: number;
  /** Characters who speak in this scene, in order of first cue. */
  speaking: string[];
  synopsis: string | null;
  meta: SceneMeta;
}

export interface CharacterEntry {
  /** The canonical cue name, uppercased. */
  name: string;
  /** How many cues. */
  cues: number;
  /** Words spoken, excluding parentheticals. */
  words: number;
  /** Indexes into `Script.scenes`. */
  scenes: number[];
  /** Every extension seen with this name. */
  extensions: string[];
  /** Offset of the first cue — for "first appears in". */
  firstAt: number;
}

export interface LocationEntry {
  /** The location as written, uppercased. */
  name: string;
  /** Which prefixes it appears with. */
  prefixes: string[];
  /** Every time of day it appears with. */
  timesOfDay: string[];
  scenes: number[];
}

/* ========================================================================== */
/* The parsed document                                                        */
/* ========================================================================== */

export interface Script {
  /** The exact source this tree was parsed from. */
  source: string;
  titlePage: TitlePage | null;
  elements: Element[];
  scenes: SceneIndexEntry[];
  characters: CharacterEntry[];
  locations: LocationEntry[];
  /** Every unresolved `[[todo: …]]`, for the to-do panel and export warning. */
  todos: { text: string; from: number; to: number; sceneId: string | null }[];
}
