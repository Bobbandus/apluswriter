import {
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type StateCommand,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  showTooltip,
  type TooltipView,
  type ViewUpdate,
} from '@codemirror/view';
import {
  characterPrefixMatches,
  predictSpeaker,
  suggestionsFor,
  type Suggestion,
} from '@aplus/fountain/autocomplete';
import { classifyLine, isBlankLine } from '@aplus/fountain/lineClassify';
import { splitCharacter } from '@aplus/fountain/parse';
import { SCENE_PREFIX_RE } from '@aplus/fountain/vocab';
import { autocompleteConfig, type AutocompleteConfig } from './dictionary';
import { setIntent } from './intent';

export { autocompleteConfig, type AutocompleteConfig };

/**
 * Autofinish — suggestions while you type.
 *
 * Two presentations, chosen by how sure we are:
 *
 * - **List** (popover + ghost text) where the context is unambiguous: a scene
 *   heading's location or time of day, a cue typed in capitals, an extension,
 *   a tag.
 * - **Ghost only** (grey text after the caret, no popover) where we are
 *   guessing: a name typed in lower case, or the predicted next speaker on an
 *   empty line. A guess should never put a box in front of the writer.
 *
 * The rule that makes this usable at speed: **Enter is never taken.** It
 * accepts a suggestion only if the writer has moved through the list with the
 * arrow keys, which is an unmistakable "I am choosing". Otherwise Enter goes
 * to the next line as it always does. Tab and → accept.
 */

interface CompletionState {
  from: number;
  to: number;
  items: Suggestion[];
  selected: number;
  mode: 'list' | 'ghost';
  /** The writer moved through the list, so Enter may accept. */
  navigated: boolean;
}

const selectSuggestion = StateEffect.define<number>();
const dismiss = StateEffect.define<number>();

/** The line a dismissal applies to, so Escape stays dismissed while you keep typing there. */
const dismissedField = StateField.define<number | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(dismiss)) return effect.value;
    if (value === null) return null;
    const line = transaction.state.doc.lineAt(transaction.state.selection.main.head).number;
    return line === value ? value : null;
  },
});

/** Text that could plausibly be a cue being typed. */
const CUE_TEXT = /^@?[\p{L}0-9'’ .-]{1,30}$/u;

/**
 * Is this line where a cue can start? That means the first line of a block:
 * either the document's first line, or a line with a blank line above it.
 */
function atCuePosition(state: EditorState, lineNumber: number): boolean {
  if (lineNumber === 1) return true;
  return isBlankLine(state.doc.line(lineNumber - 1).text);
}

/** Cues in the current scene, most recent last, for ranking and prediction. */
function recentSpeakers(state: EditorState, lineNumber: number): string[] {
  const speakers: string[] = [];
  for (let n = lineNumber - 1, seen = 0; n >= 1 && seen < 400; n -= 1, seen += 1) {
    const text = state.doc.line(n).text;
    if (isBlankLine(text)) continue;
    const type = classifyLine(state.doc, n);
    if (type === 'sceneHeading') break;
    if (type === 'character') speakers.unshift(splitCharacter(text).name.toUpperCase());
  }
  return speakers;
}

/** Did the block just above end in dialogue? That is when a new speaker is likely. */
function followsDialogue(state: EditorState, lineNumber: number): boolean {
  for (let n = lineNumber - 1; n >= 1; n -= 1) {
    const text = state.doc.line(n).text;
    if (isBlankLine(text)) continue;
    const type = classifyLine(state.doc, n);
    return type === 'dialogue' || type === 'parenthetical';
  }
  return false;
}

function without(items: Suggestion[], typed: string): Suggestion[] {
  const upper = typed.trim().toLocaleUpperCase();
  return items.filter((item) => item.value.toLocaleUpperCase() !== upper);
}

function contextAt(state: EditorState): Omit<CompletionState, 'selected' | 'navigated'> | null {
  const range = state.selection.main;
  if (!range.empty) return null;

  const head = range.head;
  const line = state.doc.lineAt(head);
  if (state.field(dismissedField, false) === line.number) return null;

  const before = line.text.slice(0, head - line.from);
  const after = line.text.slice(head - line.from);
  // Completing in the middle of a line would overwrite what follows it.
  if (after.trim().length > 0) return null;

  const { dictionary } = state.facet(autocompleteConfig);

  /* ---- a production tag ---- */
  const tag = /\[\[#\S+\s+([^\]]*)$/u.exec(before);
  if (tag) {
    const query = tag[1] ?? '';
    const items = without(suggestionsFor('tag', query, dictionary), query);
    return items.length ? { from: head - query.length, to: head, items, mode: 'list' } : null;
  }

  /* ---- a scene heading: location, then time of day ---- */
  const body = before.replace(/^\./, '');
  const prefix = SCENE_PREFIX_RE.exec(body);
  if (prefix && body.length > prefix[0].length) {
    const tail = body.slice(prefix[0].length).replace(/^\.?\s*/, '');
    const divider = Math.max(tail.lastIndexOf(' - '), tail.lastIndexOf(' – '), tail.lastIndexOf(' — '));
    const kind = divider >= 0 ? 'time' : 'location';
    const query = divider >= 0 ? tail.slice(divider + 3) : tail;
    const items = without(suggestionsFor(kind, query, dictionary), query);
    return items.length ? { from: head - query.length, to: head, items, mode: 'list' } : null;
  }

  /* ---- an extension on a cue ---- */
  const extension = /\(([^()]*)$/u.exec(before);
  if (extension && classifyLine(state.doc, line.number) !== 'action') {
    const query = extension[1] ?? '';
    const items = without(suggestionsFor('extension', query, dictionary), `(${query}`);
    return items.length ? { from: head - query.length - 1, to: head, items, mode: 'list' } : null;
  }

  if (!atCuePosition(state, line.number)) return null;

  /* ---- an empty cue line after dialogue: who speaks next? ---- */
  if (before.trim().length === 0) {
    if (!followsDialogue(state, line.number)) return null;
    const next = predictSpeaker(recentSpeakers(state, line.number), dictionary.characters);
    if (!next) return null;
    return {
      from: head,
      to: head,
      items: [{ value: next, kind: 'character', score: 1 }],
      mode: 'ghost',
    };
  }

  const typed = before.trimStart();
  if (!CUE_TEXT.test(typed)) return null;
  const from = line.from + before.length - typed.length;

  /* ---- a transition being typed in capitals ---- */
  if (typed === typed.toLocaleUpperCase() && typed.trimEnd().endsWith(':')) {
    const items = without(suggestionsFor('transition', typed, dictionary), typed);
    return items.length ? { from, to: head, items, mode: 'list' } : null;
  }

  /* ---- a cue in capitals: the writer has said it is a name ---- */
  if (typed === typed.toLocaleUpperCase() && /\p{L}/u.test(typed)) {
    // Prefix matches only. An infix match would offer NOAH the moment a
    // shouted action line starts with "A", and the box would chase the
    // writer through every capitalised sentence.
    const needle = typed.replace(/^@/, '').toLocaleUpperCase();
    const items = without(
      suggestionsFor('character', typed, dictionary, recentSpeakers(state, line.number).reverse()),
      typed,
    ).filter((item) => item.value.toLocaleUpperCase().startsWith(needle));
    return items.length ? { from, to: head, items, mode: 'list' } : null;
  }

  /* ---- lower case: a guess, so ghost text only, and only from real names ---- */
  if (typed.replace(/^@/, '').length < 2) return null;
  const match = characterPrefixMatches(typed.replace(/^@/, ''), dictionary)[0];
  if (!match) return null;
  return {
    from,
    to: head,
    items: [{ value: match, kind: 'character', score: 1 }],
    mode: 'ghost',
  };
}

const completionField = StateField.define<CompletionState | null>({
  create: (state) => {
    const next = contextAt(state);
    return next ? { ...next, selected: 0, navigated: false } : null;
  },

  update(value, transaction) {
    const next = contextAt(transaction.state);
    if (!next) return null;

    const moved = transaction.effects.find((effect) => effect.is(selectSuggestion));
    const sameList =
      value !== null &&
      value.from === next.from &&
      value.items.length === next.items.length &&
      value.items.every((item, index) => item.value === next.items[index]?.value);

    const selected = moved ? moved.value : sameList ? value.selected : 0;
    const navigated = Boolean(moved) || (sameList && value.navigated);

    return {
      ...next,
      selected: Math.max(0, Math.min(selected, next.items.length - 1)),
      navigated,
    };
  },

  provide: (field) =>
    showTooltip.from(field, (value) => {
      // A ghost is a guess; guesses do not get a box.
      if (!value || value.mode !== 'list') return null;
      return { pos: value.from, above: false, create: (view) => completionTooltip(view) };
    }),
});

/* ========================================================================== */
/* Popover                                                                    */
/* ========================================================================== */

function completionTooltip(view: EditorView): TooltipView {
  const dom = document.createElement('div');
  dom.className = 'cm-autofinish';
  dom.setAttribute('role', 'listbox');

  const render = () => {
    const state = view.state.field(completionField, false);
    if (!state) return;
    const labels = view.state.facet(autocompleteConfig).labels;

    dom.replaceChildren(
      ...state.items.map((item, index) => {
        const row = document.createElement('div');
        row.className = 'cm-autofinish-row';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(index === state.selected));

        const value = document.createElement('span');
        value.textContent = item.value;
        const kind = document.createElement('small');
        kind.textContent = labels[item.kind] ?? item.kind;

        row.append(value, kind);
        row.addEventListener('mousedown', (event) => {
          event.preventDefault();
          accept(view, index);
        });
        return row;
      }),
    );
  };

  render();
  return { dom, update: () => render() };
}

/* ========================================================================== */
/* Accepting                                                                  */
/* ========================================================================== */

function accept(view: EditorView, index?: number): boolean {
  const current = view.state.field(completionField, false);
  if (!current) return false;

  const item = current.items[index ?? current.selected];
  if (!item) return false;

  const line = view.state.doc.lineAt(current.from);
  view.dispatch({
    changes: { from: current.from, to: current.to, insert: item.value },
    selection: { anchor: current.from + item.value.length },
    userEvent: 'input.complete',
    // A completed name is a declared cue, so the next Enter gives dialogue
    // even though nothing sits under the name yet.
    effects: item.kind === 'character' ? setIntent.of({ line: line.number, type: 'character' }) : [],
  });
  return true;
}

const acceptCommand =
  (requireNavigation: boolean): ((view: EditorView) => boolean) =>
  (view) => {
    const current = view.state.field(completionField, false);
    if (!current) return false;
    if (requireNavigation && !current.navigated) return false;
    return accept(view);
  };

const move =
  (step: number): StateCommand =>
  ({ state, dispatch }) => {
    const current = state.field(completionField, false);
    if (!current || current.mode !== 'list') return false;
    const next = (current.selected + step + current.items.length) % current.items.length;
    dispatch(state.update({ effects: selectSuggestion.of(next) }));
    return true;
  };

const dismissCommand: StateCommand = ({ state, dispatch }) => {
  if (!state.field(completionField, false)) return false;
  const line = state.doc.lineAt(state.selection.main.head).number;
  dispatch(state.update({ effects: dismiss.of(line) }));
  return true;
};

/* ========================================================================== */
/* Ghost text                                                                 */
/* ========================================================================== */

class GhostWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }
  override toDOM() {
    const node = document.createElement('span');
    node.className = 'cm-autofinish-ghost';
    node.textContent = this.text;
    return node;
  }
  override eq(other: GhostWidget) {
    return other.text === this.text;
  }
  override ignoreEvent() {
    return true;
  }
}

/** The part of the suggestion not yet typed, matched case-insensitively. */
function remainder(typed: string, value: string): string {
  return value.toLocaleUpperCase().startsWith(typed.toLocaleUpperCase())
    ? value.slice(typed.length)
    : '';
}

const ghostText = ViewPlugin.fromClass(
  class {
    decorations = Decoration.none;
    constructor(view: EditorView) {
      this.build(view);
    }
    update(update: ViewUpdate) {
      this.build(update.view);
    }
    private build(view: EditorView) {
      const current = view.state.field(completionField, false);
      const item = current?.items[current.selected];
      if (!current || !item) {
        this.decorations = Decoration.none;
        return;
      }
      const typed = view.state.doc.sliceString(current.from, current.to);
      const suffix = remainder(typed, item.value);
      this.decorations = suffix
        ? Decoration.set([
            Decoration.widget({ widget: new GhostWidget(suffix), side: 1 }).range(current.to),
          ])
        : Decoration.none;
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/* ========================================================================== */

export function fountainAutocomplete(config: AutocompleteConfig): Extension[] {
  return [
    autocompleteConfig.of(config),
    dismissedField,
    completionField,
    ghostText,
    Prec.highest(
      keymap.of([
        { key: 'ArrowDown', run: move(1) },
        { key: 'ArrowUp', run: move(-1) },
        { key: 'Tab', run: acceptCommand(false) },
        { key: 'ArrowRight', run: acceptCommand(false) },
        // Enter only accepts a choice the writer actually navigated to.
        { key: 'Enter', run: acceptCommand(true) },
        { key: 'Escape', run: dismissCommand },
      ]),
    ),
  ];
}

/** Exposed for tests. */
export const __testing = { contextAt, completionField, move, dismissCommand };
