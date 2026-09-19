import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { likelyTypo } from '@aplus/fountain/autocomplete';
import { classifyRange } from '@aplus/fountain/lineClassify';
import { splitCharacter } from '@aplus/fountain/parse';
import { autocompleteConfig } from './dictionary';

/**
 * The name typo guard.
 *
 * A cue that is one keystroke away from an established character — JONATAN in
 * a script where JONATHAN has forty lines — quietly creates a second
 * character. It then shows up in the navigator, in reports, in the sides, and
 * gets its own line in the casting breakdown. This catches it at the moment it
 * is typed.
 *
 * Deliberately quiet: a dotted underline and a small fix button, never a
 * dialog. And deliberately narrow (see `likelyTypo`): only a rare name near a
 * common one, so a real cast with ANNA and ANNE is never nagged about.
 */

const TYPO_MARK = Decoration.mark({ class: 'cm-typo' });

class FixWidget extends WidgetType {
  constructor(
    private readonly suggestion: string,
    private readonly label: string,
    private readonly nameFrom: number,
    private readonly nameTo: number,
  ) {
    super();
  }

  override eq(other: FixWidget) {
    return (
      other.suggestion === this.suggestion &&
      other.nameFrom === this.nameFrom &&
      other.nameTo === this.nameTo &&
      other.label === this.label
    );
  }

  override toDOM(view: EditorView) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-typo-fix';
    button.textContent = `→ ${this.suggestion}`;
    button.title = this.label;
    button.setAttribute('aria-label', this.label);
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      view.dispatch({
        changes: { from: this.nameFrom, to: this.nameTo, insert: this.suggestion },
        userEvent: 'input.typo',
      });
      view.focus();
    });
    return button;
  }

  override ignoreEvent() {
    return false;
  }
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { dictionary, labels } = view.state.facet(autocompleteConfig);
  if (dictionary.characters.length === 0) return builder.finish();

  const { doc, selection } = view.state;
  const template = labels['typoFix'] ?? '{name}';

  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    const types = classifyRange(doc, first, last);

    for (let n = first; n <= last; n += 1) {
      if (types.get(n) !== 'character') continue;

      const line = doc.line(n);
      // While the caret is on the cue the name is still being typed; nagging
      // halfway through a word is worse than useless.
      if (selection.ranges.some((r) => r.from <= line.to && r.to >= line.from)) continue;

      const { name } = splitCharacter(line.text);
      const suggestion = likelyTypo(name, dictionary);
      if (!suggestion) continue;

      const offset = line.text.indexOf(name);
      if (offset < 0) continue;

      const nameFrom = line.from + offset;
      const nameTo = nameFrom + name.length;

      builder.add(nameFrom, nameTo, TYPO_MARK);
      builder.add(
        line.to,
        line.to,
        Decoration.widget({
          widget: new FixWidget(suggestion, template.replace('{name}', suggestion), nameFrom, nameTo),
          side: 1,
        }),
      );
    }
  }

  return builder.finish();
}

export const typoGuard = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.startState.facet(autocompleteConfig) !== update.state.facet(autocompleteConfig)
      ) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
