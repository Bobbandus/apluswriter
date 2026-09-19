import { Facet, Prec, StateEffect, StateField, type EditorState, type Extension, type StateCommand } from '@codemirror/state';
import { Decoration, EditorView, keymap, showTooltip, type TooltipView, type ViewUpdate, ViewPlugin, WidgetType } from '@codemirror/view';
import { suggestionsFor, type DictionaryData, type Suggestion } from '@aplus/fountain/autocomplete';
import { SCENE_PREFIX_RE } from '@aplus/fountain/vocab';

export interface AutocompleteConfig {
  dictionary: DictionaryData;
  labels: Record<string, string>;
}

interface CompletionState {
  from: number;
  to: number;
  items: Suggestion[];
  selected: number;
}

const EMPTY_CONFIG: AutocompleteConfig = { dictionary: { characters: [], locations: [], tags: [] }, labels: {} };
export const autocompleteConfig = Facet.define<AutocompleteConfig, AutocompleteConfig>({
  combine: (values) => values[0] ?? EMPTY_CONFIG,
});
const selectSuggestion = StateEffect.define<number>();

function contextAt(state: EditorState): Omit<CompletionState, 'selected'> | null {
  const head = state.selection.main.head;
  if (!state.selection.main.empty) return null;
  const line = state.doc.lineAt(head);
  const before = line.text.slice(0, head - line.from);
  const config = state.facet(autocompleteConfig);
  let match: RegExpExecArray | null;
  let kind: Suggestion['kind'];
  let query: string;
  let from: number;

  // `[[#prop Revol…` learns and completes the payload without touching valid Fountain syntax.
  match = /\[\[#\S+\s+([^\]]*)$/u.exec(before);
  if (match) {
    kind = 'tag';
    query = match[1] ?? '';
    from = head - query.length;
  } else {
    const body = before.replace(/^\./, '');
    const prefix = SCENE_PREFIX_RE.exec(body);
    if (prefix) {
      const tail = body.slice(prefix[0].length).replace(/^\.\s*/, '');
      const divider = Math.max(tail.lastIndexOf(' - '), tail.lastIndexOf(' – '), tail.lastIndexOf(' — '));
      kind = divider >= 0 ? 'time' : 'location';
      query = divider >= 0 ? tail.slice(divider + 3) : tail;
      from = head - query.length;
    } else {
      match = /\(([^()]*)$/u.exec(before);
      if (match) {
        kind = 'extension';
        query = match[1] ?? '';
        from = head - query.length - 1;
      } else if (/^[A-ZÅÄÖÀ-Ž0-9 @'.-]*$/u.test(before) && before.trim().length > 0) {
        kind = before.trimEnd().endsWith(':') ? 'transition' : 'character';
        query = before.trimStart();
        from = line.from + before.length - query.length;
      } else {
        return null;
      }
    }
  }

  const items = suggestionsFor(kind, query, config.dictionary);
  if (items.length === 0) return null;
  return { from, to: head, items };
}

const autocompleteField = StateField.define<CompletionState | null>({
  create: (state) => {
    const next = contextAt(state);
    return next ? { ...next, selected: 0 } : null;
  },
  update: (value, transaction) => {
    if (transaction.effects.some((effect) => effect.is(autocompleteDismiss))) return null;
    const selected = transaction.effects.find((effect) => effect.is(selectSuggestion));
    const next = contextAt(transaction.state);
    if (!next) return null;
    const index = selected ? selected.value : value?.selected ?? 0;
    return { ...next, selected: Math.max(0, Math.min(index, next.items.length - 1)) };
  },
  provide: (field) =>
    showTooltip.from(field, (value) => {
      if (!value) return null;
      return {
        pos: value.to,
        above: false,
        create(view) {
          return completionTooltip(view);
        },
      };
    }),
});

function completionTooltip(view: EditorView): TooltipView {
  const dom = document.createElement('div');
  dom.className = 'cm-autofinish';
  dom.setAttribute('role', 'listbox');

  const render = () => {
    const state = view.state.field(autocompleteField, false);
    if (!state) return;
    dom.replaceChildren(
      ...state.items.map((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cm-autofinish-row';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(index === state.selected));
        const label = view.state.facet(autocompleteConfig).labels[item.kind] ?? item.kind;
        button.innerHTML = `<span>${escapeHtml(item.value)}</span><small>${escapeHtml(label)}</small>`;
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          accept(view, index);
        });
        return button;
      }),
    );
  };
  render();
  return { dom, update: () => { render(); return true; } };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function accept(view: EditorView, index?: number): boolean {
  const current = view.state.field(autocompleteField, false);
  if (!current) return false;
  const item = current.items[index ?? current.selected];
  if (!item) return false;
  const insert = item.kind === 'extension' ? item.value : item.value;
  view.dispatch({
    changes: { from: current.from, to: current.to, insert },
    selection: { anchor: current.from + insert.length },
    userEvent: 'input.complete',
  });
  return true;
}

const acceptCompletion: StateCommand = ({ state, dispatch }) => {
  const current = state.field(autocompleteField, false);
  if (!current) return false;
  const item = current.items[current.selected];
  if (!item) return false;
  dispatch(state.update({ changes: { from: current.from, to: current.to, insert: item.value }, selection: { anchor: current.from + item.value.length }, userEvent: 'input.complete' }));
  return true;
};

const moveCompletion = (step: number): StateCommand => ({ state, dispatch }) => {
  const current = state.field(autocompleteField, false);
  if (!current) return false;
  dispatch(state.update({ effects: selectSuggestion.of((current.selected + step + current.items.length) % current.items.length) }));
  return true;
};

const dismissCompletion: StateCommand = ({ state, dispatch }) => {
  if (!state.field(autocompleteField, false)) return false;
  dispatch(state.update({ effects: autocompleteDismiss.of(true) }));
  return true;
};
const autocompleteDismiss = StateEffect.define<boolean>();

const ghostCompletion = ViewPlugin.fromClass(
  class {
    decorations = Decoration.none;
    constructor(view: EditorView) { this.build(view); }
    update(update: ViewUpdate) { this.build(update.view); }
    private build(view: EditorView) {
      const current = view.state.field(autocompleteField, false);
      if (!current) { this.decorations = Decoration.none; return; }
      const item = current.items[current.selected];
      const typed = view.state.doc.sliceString(current.from, current.to);
      const suffix = item?.value.slice(typed.length) ?? '';
      this.decorations = suffix
        ? Decoration.set([Decoration.widget({ widget: new GhostWidget(suffix), side: 1 }).range(current.to)])
        : Decoration.none;
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

class GhostWidget extends WidgetType {
  constructor(private readonly text: string) { super(); }
  override toDOM() { const node = document.createElement('span'); node.className = 'cm-autofinish-ghost'; node.textContent = this.text; return node; }
  override eq(other: GhostWidget) { return other.text === this.text; }
}

/** A lightweight, data-driven CodeMirror autofinish extension. */
export function fountainAutocomplete(config: AutocompleteConfig): Extension[] {
  return [
    autocompleteConfig.of(config),
    autocompleteField,
    ghostCompletion,
    Prec.highest(keymap.of([
      { key: 'ArrowDown', run: moveCompletion(1) },
      { key: 'ArrowUp', run: moveCompletion(-1) },
      { key: 'Tab', run: acceptCompletion },
      { key: 'Enter', run: acceptCompletion },
      { key: 'ArrowRight', run: acceptCompletion },
      { key: 'Escape', run: dismissCompletion },
    ])),
  ];
}
