import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { classifyRange, type LineType } from '@/lib/fountain/lineClassify';
import { scanInline } from '@/lib/fountain/inline';

/**
 * Live formatting.
 *
 * The document is plain Fountain text throughout — nothing here changes it.
 * What these decorations do is (a) tag each line with its element type so CSS
 * can put it at the right indent and measure, and (b) hide the markup on lines
 * the caret is not on.
 *
 * That second part is the trick that makes a plain-text editor feel like a
 * formatted page: `**bold**` shows as bold, but the moment you put the caret
 * on that line the asterisks come back, so you can always edit what is really
 * there. Modern Markdown editors do the same thing, and it works because it
 * never lies — the markup is one keystroke away, not gone.
 *
 * Only the viewport is decorated, so cost is independent of script length.
 */

/** Marker characters that force an element, stripped from the formatted view. */
const FORCING = /^(\s*)([.!@>~]|#+|=)(\s*)/;

/**
 * Is the caret on this line?
 *
 * Any cursor or selection touching the line counts, so a selection that spans
 * several lines reveals the markup on all of them.
 */
function caretOnLine(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;

  for (const { from, to } of view.visibleRanges) {
    const firstLine = doc.lineAt(from).number;
    const lastLine = doc.lineAt(to).number;
    const types = classifyRange(doc, firstLine, lastLine);

    for (let n = firstLine; n <= lastLine; n += 1) {
      const line = doc.line(n);
      const type: LineType = types.get(n) ?? 'action';

      builder.add(line.from, line.from, Decoration.line({ class: `cm-el-${type}` }));

      if (type === 'blank' || line.text.length === 0) continue;

      // The caret's own line stays as source, so what you edit is what is
      // actually in the file.
      if (caretOnLine(view, line.from, line.to)) continue;

      addInlineDecorations(builder, line.text, line.from, type);
    }
  }

  return builder.finish();
}

const HIDE = Decoration.replace({});

const EMPHASIS_CLASS: Record<string, string> = {
  bold: 'cm-fx-bold',
  italic: 'cm-fx-italic',
  boldItalic: 'cm-fx-boldItalic',
  underline: 'cm-fx-underline',
};

function addInlineDecorations(
  builder: RangeSetBuilder<Decoration>,
  text: string,
  lineFrom: number,
  type: LineType,
): void {
  /* Collected first, then sorted — RangeSetBuilder requires ascending order,
     and the forcing marker, emphasis and notes are found independently. */
  const ranges: { from: number; to: number; deco: Decoration; rank: number }[] = [];

  // The forcing character, e.g. the `.` on `.SNIPER SCOPE POV`.
  if (type !== 'action' || /^\s*!/.test(text)) {
    const forcing = FORCING.exec(text);
    if (forcing && type !== 'dialogue') {
      const start = lineFrom + (forcing[1] ?? '').length;
      const end = start + (forcing[2] ?? '').length + (forcing[3] ?? '').length;
      if (end > start) ranges.push({ from: start, to: end, deco: HIDE, rank: 0 });
    }
  }

  // Centered text carries a marker at both ends.
  if (type === 'centered') {
    const close = text.lastIndexOf('<');
    if (close >= 0) {
      ranges.push({ from: lineFrom + close, to: lineFrom + close + 1, deco: HIDE, rank: 0 });
    }
  }

  const { spans } = scanInline(text, lineFrom);

  for (const span of spans) {
    if (span.type === 'escape') {
      // Hide the backslash, show the character it protected.
      ranges.push({ from: span.from, to: span.from + 1, deco: HIDE, rank: 0 });
      continue;
    }

    if (span.type === 'note' || span.type === 'tag') {
      const cls = span.type === 'tag' ? 'cm-fx-tag' : 'cm-fx-note';
      // Hide the brackets, keep the content, pill the middle.
      ranges.push({ from: span.from, to: span.contentFrom, deco: HIDE, rank: 0 });
      if (span.contentTo > span.contentFrom) {
        ranges.push({
          from: span.contentFrom,
          to: span.contentTo,
          deco: Decoration.mark({ class: cls }),
          rank: 1,
        });
      }
      ranges.push({ from: span.contentTo, to: span.to, deco: HIDE, rank: 0 });
      continue;
    }

    const cls = EMPHASIS_CLASS[span.type];
    if (!cls) continue;

    ranges.push({ from: span.from, to: span.contentFrom, deco: HIDE, rank: 0 });
    ranges.push({
      from: span.contentFrom,
      to: span.contentTo,
      deco: Decoration.mark({ class: cls }),
      rank: 1,
    });
    ranges.push({ from: span.contentTo, to: span.to, deco: HIDE, rank: 0 });
  }

  // Ascending by position; at the same position a zero-width replace must
  // come before the mark that starts there.
  ranges.sort((a, b) => a.from - b.from || a.rank - b.rank || a.to - b.to);

  for (const range of ranges) {
    if (range.to < range.from) continue;
    builder.add(range.from, range.to, range.deco);
  }
}

export const fountainDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      // Selection matters as much as the document here: moving the caret onto
      // a line is what reveals its markup.
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
