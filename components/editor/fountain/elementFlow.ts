import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type StateCommand,
  type Transaction,
} from '@codemirror/state';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { classifyLine, isBlankLine, type LineType } from '@/lib/fountain/lineClassify';
import { rewriteLine, type SwitchableType } from '@/lib/fountain/rewrite';
import { CONTD_EN, CONTD_RE, CONTD_SV, SCENE_PREFIX_RE, TOD_SEPARATOR_RE } from '@/lib/fountain/vocab';
import { splitCharacter } from '@/lib/fountain/parse';
import { openPicker } from './picker';

/**
 * The element flow — what Enter and Tab do.
 *
 * A screenwriter should be able to write a feature without touching the mouse,
 * and in a Fountain editor that is almost entirely a question of blank lines.
 * Fountain's element types are positional: a cue is a cue because of the blank
 * line above it and the absence of one below. So "Enter after a character gives
 * dialogue" is not a mode change — it is inserting one newline instead of two.
 *
 * That is why this file is a table of newline counts rather than a state
 * machine over element types. The document stays plain text; the writer just
 * stops having to think about the spacing.
 */

export interface FlowSettings {
  /** Insert `(CONT'D)` when the same character speaks again after action. */
  autoContd: boolean;
  /** Uppercase scene headings and cues as they are typed. */
  autoUppercase: boolean;
  /** Which "continued" marker to use. */
  locale: 'sv' | 'en';
  /** Tab on a cue: add a parenthetical, or a character extension. */
  tabOnCharacter: 'parenthetical' | 'extension';
}

export const DEFAULT_FLOW: FlowSettings = {
  autoContd: true,
  autoUppercase: true,
  locale: 'sv',
  tabOnCharacter: 'parenthetical',
};

/* ========================================================================== */
/* Declared intent                                                            */
/* ========================================================================== */

/**
 * What the writer said this line is, when the text cannot say it yet.
 *
 * Fountain decides a cue by position: `BRICK` is a character only because a
 * line of dialogue follows it. So the instant a writer starts typing a name on
 * a fresh line, the document genuinely reads as Action — there is nothing
 * under it yet. Classification alone therefore cannot auto-uppercase a cue,
 * and cannot know that Enter should insert one newline rather than two.
 *
 * Pressing Tab, ⌘3, or picking from the element picker is the writer *saying*
 * what the line is. That declaration is held here until the caret leaves the
 * line, and it outranks classification while it lasts. It changes no text —
 * the document stays exactly what was typed.
 */
export const setIntent = StateEffect.define<{ line: number; type: SwitchableType } | null>();

export const intentField = StateField.define<{ line: number; type: SwitchableType } | null>({
  create: () => null,

  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setIntent)) return effect.value;
    }

    if (!value) return null;

    // The declaration belongs to one line. Leaving it drops the intent.
    if (transaction.docChanged || transaction.selection) {
      const head = transaction.state.selection.main.head;
      if (transaction.state.doc.lineAt(head).number !== value.line) return null;
    }

    return value;
  },
});

/** What this line is, preferring the writer's declaration over inference. */
function effectiveType(state: EditorState, lineNumber: number): LineType {
  const intent = state.field(intentField, false);
  if (intent && intent.line === lineNumber) return intent.type as LineType;
  return classifyLine(state.doc, lineNumber);
}

/* ========================================================================== */
/* Enter                                                                      */
/* ========================================================================== */

/**
 * How many newlines Enter inserts after each element type.
 *
 * Two means "end this block" — the next thing typed starts a fresh element.
 * One means "stay in this block", which is the only way dialogue can follow a
 * cue at all.
 */
const NEWLINES_AFTER: Record<string, number> = {
  sceneHeading: 2, // A heading needs a blank line after it or it is a cue.
  action: 2,
  character: 1, // Dialogue must touch its cue.
  parenthetical: 1,
  dialogue: 2, // Enter ends the speech; Shift+Enter continues it.
  transition: 2,
  centered: 2,
  lyrics: 1, // Songs run on.
  section: 2,
  synopsis: 2,
  note: 1,
  pageBreak: 2,
  blank: 1,
};

export function enterCommand(settings: () => FlowSettings): StateCommand {
  return ({ state, dispatch }) => {
    const range = state.selection.main;
    const line = state.doc.lineAt(range.head);
    const type = effectiveType(state, line.number);

    // Enter on an already-empty line opens the element picker, which is the
    // one place the writer is told what their options are.
    if (isBlankLine(line.text) && range.empty) {
      const previous = line.number > 1 ? state.doc.line(line.number - 1) : null;
      if (!previous || isBlankLine(previous.text)) {
        dispatch(state.update({ effects: openPicker.of(range.head) }));
        return true;
      }
    }

    let insert = '\n'.repeat(NEWLINES_AFTER[type] ?? 2);
    let head = range.from + insert.length;
    const changes: { from: number; to?: number; insert: string }[] = [];

    // A cue that repeats after only action gets its continued marker.
    if (type === 'character' && settings().autoContd) {
      const contd = continuedMarkerFor(state, line.number, settings().locale);
      if (contd) {
        changes.push({ from: line.to, insert: ` ${contd}` });
        head += contd.length + 1;
      }
    }

    changes.push({ from: range.from, to: range.to, insert });

    dispatch(
      state.update({
        changes,
        selection: EditorSelection.cursor(head),
        scrollIntoView: true,
        userEvent: 'input',
      }),
    );
    return true;
  };
}

/**
 * The `(CONT'D)` to append to this cue, or null.
 *
 * Only when the same character spoke earlier in the scene with nothing but
 * action in between. A cue interrupted by another character's line is not
 * continued — it is a new speech, and marking it would be wrong.
 */
function continuedMarkerFor(state: EditorState, lineNumber: number, locale: 'sv' | 'en'): string | null {
  const text = state.doc.line(lineNumber).text.trim();
  if (CONTD_RE.test(text)) return null;

  const { name } = splitCharacter(text);
  if (!name) return null;

  for (let n = lineNumber - 1; n >= 1; n -= 1) {
    const candidate = state.doc.line(n);
    if (isBlankLine(candidate.text)) continue;

    const type = classifyLine(state.doc, n);

    // A heading resets the scene — nothing carries across it.
    if (type === 'sceneHeading' || type === 'transition') return null;
    if (type === 'dialogue' || type === 'parenthetical') continue;

    if (type === 'character') {
      const previous = splitCharacter(candidate.text.trim());
      return previous.name.toUpperCase() === name.toUpperCase()
        ? locale === 'sv'
          ? CONTD_SV
          : CONTD_EN
        : null;
    }

    // Action between the two cues is exactly the case this is for.
  }

  return null;
}

/** Shift+Enter: a hard line break that stays inside the current element. */
const softBreak: StateCommand = ({ state, dispatch }) => {
  dispatch(
    state.update(state.replaceSelection('\n'), { scrollIntoView: true, userEvent: 'input' }),
  );
  return true;
};

/* ========================================================================== */
/* Tab                                                                        */
/* ========================================================================== */

/** The cycle Tab walks when there is nothing more specific to do. */
const TAB_CYCLE: SwitchableType[] = [
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'sceneHeading',
  'transition',
];

function replaceLine(
  state: EditorState,
  lineNumber: number,
  text: string,
  declare?: SwitchableType,
): Transaction {
  const line = state.doc.line(lineNumber);
  return state.update({
    changes: { from: line.from, to: line.to, insert: text },
    selection: EditorSelection.cursor(line.from + text.length),
    scrollIntoView: true,
    userEvent: 'input',
    // Record what the writer just said this line is, so an empty cue line
    // still uppercases and still gets dialogue on Enter.
    effects: declare ? setIntent.of({ line: lineNumber, type: declare }) : undefined,
  });
}

export function tabCommand(settings: () => FlowSettings, back: boolean): StateCommand {
  return ({ state, dispatch }) => {
    const range = state.selection.main;
    const line = state.doc.lineAt(range.head);
    const text = line.text;
    const trimmed = text.trim();
    const type = effectiveType(state, line.number);

    /* ---- completing a scene heading ---- */
    if (!back && type === 'sceneHeading') {
      const body = trimmed.replace(/^\./, '');
      const prefix = SCENE_PREFIX_RE.exec(body);

      // Just the prefix so far: `INT` → `INT. `, ready for the location.
      if (prefix && body.slice(prefix[0].length).trim().length === 0) {
        const withDot = `${body.replace(/\.?\s*$/, '')}. `;
        dispatch(replaceLine(state, line.number, (trimmed.startsWith('.') ? '.' : '') + withDot));
        return true;
      }

      // A location but no time of day: offer the separator.
      if (prefix && ![...body.matchAll(TOD_SEPARATOR_RE)].length) {
        dispatch(replaceLine(state, line.number, `${text.replace(/\s+$/, '')} - `));
        return true;
      }
    }

    /* ---- a cue wants a parenthetical or an extension under it ---- */
    if (!back && type === 'character' && trimmed.length > 0) {
      if (settings().tabOnCharacter === 'extension') {
        dispatch(replaceLine(state, line.number, `${text.replace(/\s+$/, '')} ()`));
        // Caret inside the parentheses.
        dispatch(
          state.update({ selection: EditorSelection.cursor(line.from + text.trimEnd().length + 2) }),
        );
        return true;
      }

      dispatch(
        state.update({
          changes: { from: line.to, insert: '\n()' },
          selection: EditorSelection.cursor(line.to + 2),
          scrollIntoView: true,
          userEvent: 'input',
        }),
      );
      return true;
    }

    /* ---- otherwise, step through the element types ---- */
    const current = TAB_CYCLE.indexOf(type as SwitchableType);
    const index = current < 0 ? 0 : current;
    const next = TAB_CYCLE[(index + (back ? -1 : 1) + TAB_CYCLE.length) % TAB_CYCLE.length];
    if (!next) return false;

    dispatch(replaceLine(state, line.number, rewriteLine(text, next), next));
    return true;
  };
}

/* ========================================================================== */
/* Direct element switching                                                   */
/* ========================================================================== */

/** ⌘1–⌘8. Rewrites the current line's markup for the chosen type. */
export function switchElement(type: SwitchableType): StateCommand {
  return ({ state, dispatch }) => {
    const line = state.doc.lineAt(state.selection.main.head);
    const next = rewriteLine(line.text, type);
    dispatch(replaceLine(state, line.number, next, type));
    return true;
  };
}

/* ========================================================================== */
/* Typing behaviour                                                           */
/* ========================================================================== */

/** Types whose text is uppercase by convention. */
const UPPERCASE_TYPES = new Set<LineType>(['sceneHeading', 'character', 'transition']);

/**
 * Auto-uppercase and bracket auto-close.
 *
 * Uppercasing is done on input rather than with `text-transform`, because the
 * page has to show what the file actually contains. A CSS transform would make
 * the editor display `INT. HOUSE` while the file said `int. house`, and the
 * exported PDF would then disagree with the screen.
 */
function makeInputHandler(settings: () => FlowSettings) {
  return EditorView.inputHandler.of((view, from, to, text) => {
    const { state } = view;

    // Auto-close, so `(` and `[[` never have to be closed by hand.
    if (text === '(' && from === to) {
      view.dispatch({
        changes: { from, insert: '()' },
        selection: EditorSelection.cursor(from + 1),
        userEvent: 'input.type',
      });
      return true;
    }

    if (text === '[' && from === to && state.doc.sliceString(from - 1, from) === '[') {
      view.dispatch({
        changes: { from, insert: '[]]' },
        selection: EditorSelection.cursor(from + 1),
        userEvent: 'input.type',
      });
      return true;
    }

    if (!settings().autoUppercase) return false;
    // A multi-line paste is somebody's script arriving, not a slugline being
    // typed — leave it exactly as it came.
    if (text.includes('\n')) return false;

    const line = state.doc.lineAt(from);
    const type = effectiveType(state, line.number);
    if (!UPPERCASE_TYPES.has(type)) return false;

    const head = from - line.from;
    const tail = to - line.from;
    const next = line.text.slice(0, head) + text + line.text.slice(tail);
    const upper = uppercaseOutsideParens(next);

    if (upper === next) return false;

    /* Uppercasing shifts nothing only while the case mapping is 1:1. German
       ß uppercases to SS, which would move the caret — rare, but silently
       corrupting a cursor is worse than leaving one line in lower case. */
    if (upper.length !== next.length) return false;

    /* The whole line is rewritten, not just the new character. A line only
       becomes recognisable as a heading once `INT` is typed, so per-character
       uppercasing would leave `int. KITCHEN - DAY` — correct from the moment
       it could tell, and wrong-looking forever. */
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: upper },
      selection: EditorSelection.cursor(from + text.length),
      userEvent: 'input.type',
    });
    return true;
  });
}

/**
 * Uppercases a line, leaving anything in parentheses alone.
 *
 * Character extensions are allowed to be lower case — the spec gives
 * `(on the radio)` as an example — so they are protected here.
 */
function uppercaseOutsideParens(text: string): string {
  let depth = 0;
  let out = '';

  for (const ch of text) {
    if (ch === '(') depth += 1;
    out += depth === 0 ? ch.toUpperCase() : ch;
    if (ch === ')') depth = Math.max(0, depth - 1);
  }

  return out;
}

/* ========================================================================== */
/* Assembly                                                                   */
/* ========================================================================== */

const SWITCH_KEYS: [string, SwitchableType][] = [
  ['Mod-1', 'sceneHeading'],
  ['Mod-2', 'action'],
  ['Mod-3', 'character'],
  ['Mod-4', 'dialogue'],
  ['Mod-5', 'parenthetical'],
  ['Mod-6', 'transition'],
  ['Mod-7', 'section'],
  ['Mod-8', 'synopsis'],
];

export function elementFlow(getSettings: () => FlowSettings): Extension[] {
  const keys: KeyBinding[] = [
    { key: 'Enter', run: enterCommand(getSettings) },
    { key: 'Shift-Enter', run: softBreak },
    { key: 'Tab', run: tabCommand(getSettings, false) },
    { key: 'Shift-Tab', run: tabCommand(getSettings, true) },
    ...SWITCH_KEYS.map(([key, type]) => ({ key, run: switchElement(type), preventDefault: true })),
  ];

  // Must outrank the default keymap, which owns Enter and Tab and would
  // otherwise win and insert a plain newline.
  return [intentField, Prec.high(keymap.of(keys)), makeInputHandler(getSettings)];
}
