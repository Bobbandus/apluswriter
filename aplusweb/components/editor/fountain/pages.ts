import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { PageBreakInfo, PageLayout } from '@aplus/paginator/layout';

/**
 * The page view: real gaps between real pages.
 *
 * Where the paginator says a page ends, the editor draws the end of one sheet,
 * a strip of canvas, and the top of the next — with the page number, and the
 * `(MORE)` / `NAME (CONT'D)` a split speech gets. Each gap is as tall as the
 * space the previous page leaves empty, so a sheet on screen is as long as
 * the sheet that comes out of the printer.
 *
 * The breaks come from the parse worker, a moment after typing stops. In
 * between they are mapped through each edit, so they ride along with the text
 * rather than jumping about. The line-level truth still comes from the
 * paginator, which is shared with the PDF exporter.
 */

export const setPageLayout = StateEffect.define<PageLayout | null>();

interface PageState {
  layout: PageLayout | null;
  decorations: DecorationSet;
}

class PageGapWidget extends WidgetType {
  constructor(
    private readonly info: PageBreakInfo,
    private readonly linesPerPage: number,
  ) {
    super();
  }

  override eq(other: PageGapWidget) {
    const a = this.info;
    const b = other.info;
    return (
      a.page === b.page &&
      a.rowsBefore === b.rowsBefore &&
      a.more?.text === b.more?.text &&
      a.contd?.text === b.contd?.text &&
      this.linesPerPage === other.linesPerPage
    );
  }

  override toDOM() {
    const root = document.createElement('div');
    root.className = 'cm-pageGap';
    root.setAttribute('aria-hidden', 'true');

    // The empty rows the previous page ends with, so its sheet is full length.
    const emptyRows = Math.max(0, this.linesPerPage - this.info.rowsBefore);
    const tail = document.createElement('div');
    tail.className = 'cm-pageGap-tail';
    tail.style.height = `calc(var(--script-leading) * ${emptyRows})`;
    if (this.info.more) tail.append(line(this.info.more.text, this.info.more.indentIn, 'cm-pageGap-more'));
    root.append(tail);

    const gap = document.createElement('div');
    gap.className = 'cm-pageGap-gap';
    root.append(gap);

    const head = document.createElement('div');
    head.className = 'cm-pageGap-head';
    const folio = document.createElement('span');
    folio.className = 'cm-pageGap-folio';
    folio.textContent = `${this.info.page}.`;
    head.append(folio);
    root.append(head);

    if (this.info.contd) root.append(line(this.info.contd.text, this.info.contd.indentIn, 'cm-pageGap-contd'));

    return root;
  }

  override ignoreEvent() {
    return true;
  }
}

/** A printed line positioned at its real indent, relative to the text block. */
function line(text: string, indentIn: number, className: string): HTMLElement {
  const node = document.createElement('div');
  node.className = className;
  node.textContent = text;
  // Indents are from the paper edge; the text block already starts 1.5" in.
  node.style.paddingLeft = `calc(${indentIn - 1.5}in * var(--zoom, 1))`;
  return node;
}

/** The end of the title page: a sheet of its own in print, so here too. */
class TitleGapWidget extends WidgetType {
  constructor(private readonly emptyRows: number) {
    super();
  }
  override eq(other: TitleGapWidget) {
    return other.emptyRows === this.emptyRows;
  }
  override toDOM() {
    const root = document.createElement('div');
    root.className = 'cm-pageGap cm-pageGap-title';
    root.setAttribute('aria-hidden', 'true');
    const tail = document.createElement('div');
    tail.className = 'cm-pageGap-tail';
    tail.style.height = `calc(var(--script-leading) * ${this.emptyRows})`;
    const gap = document.createElement('div');
    gap.className = 'cm-pageGap-gap';
    const head = document.createElement('div');
    head.className = 'cm-pageGap-head';
    root.append(tail, gap, head);
    return root;
  }
  override ignoreEvent() {
    return true;
  }
}

class LastPageWidget extends WidgetType {
  constructor(private readonly emptyRows: number) {
    super();
  }
  override eq(other: LastPageWidget) {
    return other.emptyRows === this.emptyRows;
  }
  override toDOM() {
    const node = document.createElement('div');
    node.className = 'cm-pageTail';
    node.setAttribute('aria-hidden', 'true');
    node.style.height = `calc(var(--script-leading) * ${this.emptyRows})`;
    return node;
  }
}

function build(state: EditorState, layout: PageLayout | null): DecorationSet {
  if (!layout || layout.pageCount === 0) return Decoration.none;
  const doc = state.doc;
  const ranges = [];

  if (layout.bodyFrom !== null && layout.bodyFrom > 0 && layout.bodyFrom <= doc.length) {
    const bodyLine = doc.lineAt(layout.bodyFrom);
    const titleRows = bodyLine.number - 1;
    ranges.push(
      Decoration.widget({
        widget: new TitleGapWidget(Math.max(0, layout.linesPerPage - titleRows)),
        block: true,
        side: -1,
      }).range(bodyLine.from),
    );
  }

  for (const info of layout.breaks) {
    if (info.from < 0 || info.from > doc.length) continue;
    // A break can only be drawn between lines, so it goes above the line the
    // new page starts in. Mid-line splits are exact in the PDF; here the whole
    // source line moves to the new sheet.
    const at = doc.lineAt(info.from).from;
    ranges.push(
      Decoration.widget({ widget: new PageGapWidget(info, layout.linesPerPage), block: true, side: -1 }).range(at),
    );
  }

  // Fill the last sheet out to a full page.
  const empty = Math.max(0, layout.linesPerPage - layout.lastPageRows);
  ranges.push(Decoration.widget({ widget: new LastPageWidget(empty), block: true, side: 1 }).range(doc.length));

  return Decoration.set(ranges, true);
}

const pageField = StateField.define<PageState>({
  create: () => ({ layout: null, decorations: Decoration.none }),

  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setPageLayout)) {
        return { layout: effect.value, decorations: build(transaction.state, effect.value) };
      }
    }
    if (!transaction.docChanged) return value;
    // Ride along with the edit until the worker sends a fresh layout.
    return { layout: value.layout, decorations: value.decorations.map(transaction.changes) };
  },

  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

export function pageView(): Extension {
  return pageField;
}
