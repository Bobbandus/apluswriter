import type { Pagination } from './paginate';

/**
 * What the editor needs from a pagination: where each page begins, and how
 * much of the previous page was left empty.
 *
 * Deliberately small. The full pagination is a few thousand line objects for
 * a feature; this is one entry per page. It crosses from the parse worker to
 * the main thread on every idle moment, so it has to be cheap to send.
 */
export interface PageBreakInfo {
  /** The page that starts here. Always ≥ 2 — page 1 needs no break. */
  page: number;
  /** Source offset of the first real text on the new page. */
  from: number;
  /** Rows used on the page that ends here, including a (MORE) line. */
  rowsBefore: number;
  /** Rows used on the page that starts here, including a continued cue. */
  rowsAfter: number;
  /** `(MORE)` printed at the bottom of the previous page, if a speech split. */
  more?: { text: string; indentIn: number };
  /** `NAME (CONT'D)` printed at the top of this page, if a speech split. */
  contd?: { text: string; indentIn: number };
}

export interface PageLayout {
  pageCount: number;
  linesPerPage: number;
  breaks: PageBreakInfo[];
  /** Rows used on the last page, so the editor can draw it full height. */
  lastPageRows: number;
  sceneEighths: number[];
  /**
   * Where the script body starts, if there is a title page. In print the
   * title page is a sheet of its own, so the editor draws a break here too.
   */
  bodyFrom: number | null;
}

export function pageLayout(pagination: Pagination, bodyFrom: number | null = null): PageLayout {
  const breaks: PageBreakInfo[] = [];
  const { pages } = pagination;

  for (let i = 1; i < pages.length; i += 1) {
    const previous = pages[i - 1];
    const page = pages[i];
    if (!previous || !page || page.from < 0) continue;

    const last = previous.rows[previous.rows.length - 1]?.[0];
    const first = page.rows[0]?.[0];

    const info: PageBreakInfo = {
      page: page.number,
      from: page.from,
      rowsBefore: previous.rows.length,
      rowsAfter: page.rows.length,
    };
    if (last?.kind === 'more') info.more = { text: last.text, indentIn: last.indentIn };
    if (first?.kind === 'contd') info.contd = { text: first.text, indentIn: first.indentIn };
    breaks.push(info);
  }

  return {
    pageCount: pages.length,
    linesPerPage: pagination.linesPerPage,
    breaks,
    lastPageRows: pages[pages.length - 1]?.rows.length ?? 0,
    sceneEighths: pagination.sceneEighths,
    bodyFrom,
  };
}

/** Which page an offset falls on, 1-based. */
export function pageAt(layout: PageLayout, offset: number): number {
  let page = 1;
  for (const info of layout.breaks) {
    if (offset >= info.from) page = info.page;
    else break;
  }
  return page;
}
