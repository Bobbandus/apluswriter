import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/**
 * What the editor does in focus mode: everything but the paragraph being written is dimmed,
 * and the caret line stays at the same height, like a typewriter's, so the eye never travels.
 */
export type DimScope = 'paragraph' | 'scene' | 'off';

const dimmed = Decoration.line({ class: 'cm-dim' });
const HEADING = /^(?:\.(?!\.)|(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ])/i;

/** The first and last line number of what stays lit around the caret. */
export function litRange(lines: string[], caretLine: number, scope: Exclude<DimScope, 'off'>): [number, number] {
  const at = Math.max(0, Math.min(lines.length - 1, caretLine - 1));
  if (scope === 'paragraph') {
    if (lines[at]!.trim() === '') return [at + 1, at + 1];
    let from = at;
    let to = at;
    while (from > 0 && lines[from - 1]!.trim() !== '') from--;
    while (to < lines.length - 1 && lines[to + 1]!.trim() !== '') to++;
    return [from + 1, to + 1];
  }
  let from = at;
  while (from > 0 && !HEADING.test(lines[from]!)) from--;
  let to = at + 1;
  while (to < lines.length && !HEADING.test(lines[to]!)) to++;
  return [from + 1, to];
}

function dimming(scope: Exclude<DimScope, 'off'>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) this.decorations = this.build(update.view);
      }
      build(view: EditorView): DecorationSet {
        const { doc } = view.state;
        const lines = doc.toString().split('\n');
        const [from, to] = litRange(lines, doc.lineAt(view.state.selection.main.head).number, scope);
        const builder = new RangeSetBuilder<Decoration>();
        for (let number = 1; number <= doc.lines; number++) {
          if (number < from || number > to) builder.add(doc.line(number).from, doc.line(number).from, dimmed);
        }
        return builder.finish();
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

/** Keeps the caret line where it is, so the page moves and the eye does not. */
const typewriter = ViewPlugin.fromClass(
  class {
    frame = 0;
    update(update: ViewUpdate) {
      if (!(update.docChanged || update.selectionSet) || !update.view.hasFocus) return;
      cancelAnimationFrame(this.frame);
      const view = update.view;
      this.frame = requestAnimationFrame(() => {
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) });
      });
    }
    destroy() {
      cancelAnimationFrame(this.frame);
    }
  },
);

const theme = EditorView.baseTheme({
  '.cm-line': { transition: 'opacity 160ms ease-out' },
  '.cm-dim': { opacity: '0.28' },
});

export interface LockIn {
  /** Focus mode is on. */
  focus: boolean;
  dim: DimScope;
  typewriter: 'focus' | 'always' | 'off';
}

export function lockIn({ focus, dim, typewriter: keep }: LockIn): Extension {
  const centred = keep === 'always' || (keep === 'focus' && focus);
  const dimmed = focus && dim !== 'off';
  if (!centred && !dimmed) return [];
  return [theme, ...(centred ? [typewriter] : []), ...(dimmed ? [dimming(dim as Exclude<DimScope, 'off'>)] : [])];
}
