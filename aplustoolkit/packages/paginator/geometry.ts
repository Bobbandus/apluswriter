/**
 * Screenplay page geometry.
 *
 * This is the single source of truth for page size, margins and element
 * indents. The on-screen page view and the PDF exporter both read from here —
 * that is the whole reason it exists. Two implementations of these numbers
 * would drift within a week, and a writer whose PDF paginates differently from
 * their screen has been lied to about how long their film is.
 *
 * Everything is in inches. Courier is a 10-pitch face: at 12pt, one character
 * is exactly 0.1" wide and one single-spaced line is exactly 1/6".
 */

/** Characters per inch. Courier 12pt is 10-pitch, by definition. */
export const CPI = 10;

/** Lines per inch, single spaced at 12pt. */
export const LPI = 6;

export const FONT_SIZE_PT = 12;

/** Points per inch — for the PDF exporter, which works in points. */
export const PT_PER_IN = 72;

export type PageSize = 'a4' | 'letter';

export interface PageDimensions {
  widthIn: number;
  heightIn: number;
}

export const PAGE_SIZES: Record<PageSize, PageDimensions> = {
  /** 210 × 297 mm. The default — A+ Studios is a Swedish studio. */
  a4: { widthIn: 8.2677, heightIn: 11.6929 },
  letter: { widthIn: 8.5, heightIn: 11 },
};

/**
 * Margins in inches. The wide left margin is for the brads — it is a binding
 * allowance, not a typographic choice, which is why it is asymmetric.
 */
export const MARGINS = {
  top: 1,
  right: 1,
  bottom: 1,
  left: 1.5,
} as const;

export type ElementKind =
  | 'sceneHeading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'centered'
  | 'lyrics'
  | 'pageBreak'
  | 'section'
  | 'synopsis';

export interface ElementMetrics {
  /** Left offset from the page edge, in inches. */
  indentIn: number;
  /** Text column width, in inches. `null` means "to the right margin". */
  widthIn: number | null;
  /** How the line sits within its column. */
  align: 'left' | 'right' | 'center';
}

/**
 * Industry-standard indents, measured from the left edge of the paper.
 *
 * At 10 cpi these work out to the counts every screenwriting app agrees on:
 * 60-character action, 35-character dialogue, 20-character parentheticals.
 */
export const ELEMENT_METRICS: Record<ElementKind, ElementMetrics> = {
  sceneHeading: { indentIn: 1.5, widthIn: null, align: 'left' },
  action: { indentIn: 1.5, widthIn: null, align: 'left' },
  character: { indentIn: 3.7, widthIn: null, align: 'left' },
  parenthetical: { indentIn: 3.1, widthIn: 2.0, align: 'left' },
  dialogue: { indentIn: 2.5, widthIn: 3.5, align: 'left' },
  transition: { indentIn: 1.5, widthIn: null, align: 'right' },
  centered: { indentIn: 1.5, widthIn: null, align: 'center' },
  lyrics: { indentIn: 2.5, widthIn: 3.5, align: 'left' },
  pageBreak: { indentIn: 1.5, widthIn: null, align: 'left' },
  section: { indentIn: 1.5, widthIn: null, align: 'left' },
  synopsis: { indentIn: 1.5, widthIn: null, align: 'left' },
};

/** Width of the text block, edge margin to edge margin. */
export function contentWidthIn(size: PageSize): number {
  return PAGE_SIZES[size].widthIn - MARGINS.left - MARGINS.right;
}

/** Height of the text block. */
export function contentHeightIn(size: PageSize): number {
  return PAGE_SIZES[size].heightIn - MARGINS.top - MARGINS.bottom;
}

/**
 * How many single-spaced lines fit on one page.
 *
 * Letter gives 54 and A4 gives 58. The "55 lines" the industry quotes is
 * Letter with the page number sharing the top margin — we count the body only
 * and place the folio inside the margin, which is what Final Draft does.
 */
export function linesPerPage(size: PageSize): number {
  return Math.floor(contentHeightIn(size) * LPI);
}

/** How many characters fit on one line of a given element. */
export function charsPerLine(kind: ElementKind, size: PageSize): number {
  const metrics = ELEMENT_METRICS[kind];
  const available =
    metrics.widthIn ?? PAGE_SIZES[size].widthIn - metrics.indentIn - MARGINS.right;
  return Math.floor(available * CPI);
}

/** Inches → CSS pixels at a given zoom. 96 px per inch is the CSS reference. */
export function inToPx(inches: number, zoom = 1): number {
  return inches * 96 * zoom;
}

/** Inches → PDF points. */
export function inToPt(inches: number): number {
  return inches * PT_PER_IN;
}

/**
 * Estimated screen time. The industry rule is one page ≈ one minute, and it
 * holds up well enough to plan a shoot around — but it is an estimate, and the
 * UI should always present it as one.
 */
export function estimateMinutes(pages: number): number {
  return pages;
}
