import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Script, TitlePageField } from '../fountain/types';
import { MARGINS, PAGE_SIZES, PT_PER_IN, type PageSize } from '../paginator/geometry';
import { paginate, type PageLine, type Pagination } from '../paginator/paginate';
import { styledChars, toRuns, type Run } from '../paginator/text';
import { NOTHING_REVISED, revisionMarks } from './revisionMarks';

/**
 * PDF export.
 *
 * The page content comes from the paginator — the same one the editor's page
 * view uses — so the PDF cannot disagree with the screen about where a page
 * ends. This file only decides *how* a line is drawn, never *which* page it
 * is on.
 *
 * Courier Prime is embedded, not referenced. Courier is monospaced, so every
 * character is exactly 0.1" wide at 12pt; that is what lets alignment be
 * computed from a character count with no font metrics involved.
 */

export interface PdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
}

export interface PdfOptions {
  pageSize: PageSize;
  /** Print scene numbers in both margins. */
  sceneNumbers?: boolean;
  /** A name across every page, for a script sent to one reader. */
  watermark?: string;
  /** Print the title page, if the script has one. */
  titlePage?: boolean;
  /**
   * An earlier draft to compare with. Every printed line that changed since
   * then gets a `*` in the right margin, the way revised pages are issued.
   */
  revisionBaseline?: string;
  /** Printed at the top of each page when comparing: "BLUE REVISION". */
  revisionLabel?: string;
  moreLabel?: string;
  contdLabel?: string;
  /** Pagination to draw. Computed if not given. */
  pagination?: Pagination;
}

const FONT_SIZE = 12;
const LINE = 12; // 6 lines to the inch
const CHAR = 7.2; // 0.1" per character at 12pt Courier

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

function fontFor(run: Run, fonts: FontSet): PDFFont {
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.regular;
}

/** Draws styled runs starting at x, on a baseline. Underline is drawn by hand. */
function drawRuns(page: PDFPage, runs: Run[], x: number, baseline: number, fonts: FontSet): void {
  let cursor = x;
  for (const run of runs) {
    if (!run.text) continue;
    page.drawText(run.text, { x: cursor, y: baseline, size: FONT_SIZE, font: fontFor(run, fonts), color: rgb(0, 0, 0) });
    const width = run.text.length * CHAR;
    if (run.underline) {
      page.drawLine({
        start: { x: cursor, y: baseline - 1.6 },
        end: { x: cursor + width, y: baseline - 1.6 },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
    }
    cursor += width;
  }
}

function lineX(line: PageLine): number {
  const width = line.text.length * CHAR;
  const left = line.indentIn * PT_PER_IN;
  const columnWidth = line.widthIn * PT_PER_IN;
  if (line.align === 'right') return left + columnWidth - width;
  if (line.align === 'center') return left + (columnWidth - width) / 2;
  return left;
}

/** Baseline of a row, counted from the top margin. */
function baselineFor(row: number, heightPt: number): number {
  // Courier Prime's ascent puts the baseline about 9.5pt into a 12pt line.
  return heightPt - MARGINS.top * PT_PER_IN - row * LINE - 9.5;
}

function drawWatermark(page: PDFPage, text: string, font: PDFFont, widthPt: number, heightPt: number): void {
  const size = Math.min(72, (widthPt * 1.1) / Math.max(4, text.length) / 0.6);
  const width = text.length * size * 0.6;
  // Rotated 45°, centred: offset the origin back along the diagonal.
  const angle = Math.PI / 4;
  page.drawText(text, {
    x: widthPt / 2 - (Math.cos(angle) * width) / 2,
    y: heightPt / 2 - (Math.sin(angle) * width) / 2,
    size,
    font,
    rotate: degrees(45),
    color: rgb(0.55, 0.55, 0.55),
    opacity: 0.16,
  });
}

/* ========================================================================== */
/* Title page                                                                 */
/* ========================================================================== */

function field(fields: TitlePageField[], ...keys: string[]): TitlePageField | undefined {
  return fields.find((f) => keys.includes(f.key));
}

/** A title-page value as styled runs, so `_**BRICK & STEEL**_` prints as intended. */
function valueRuns(value: string): Run[] {
  return toRuns(styledChars(value));
}

function drawTitlePage(page: PDFPage, script: Script, fonts: FontSet, widthPt: number, heightPt: number): void {
  const fields = script.titlePage?.fields ?? [];
  const centre = (runs: Run[], baseline: number) => {
    const chars = runs.reduce((n, r) => n + r.text.length, 0);
    drawRuns(page, runs, (widthPt - chars * CHAR) / 2, baseline, fonts);
  };

  // The title sits a third of the way down, as on every title page.
  let baseline = heightPt - 3.5 * PT_PER_IN;

  const block = (f: TitlePageField | undefined, gapBefore: number) => {
    if (!f) return;
    baseline -= gapBefore * LINE;
    for (const value of f.values) {
      centre(valueRuns(value), baseline);
      baseline -= LINE;
    }
  };

  block(field(fields, 'title', 'titel'), 0);
  block(field(fields, 'credit'), 3);
  block(field(fields, 'author', 'authors', 'författare', 'manus'), 1);
  block(field(fields, 'source', 'källa'), 2);

  // Contact and notes bottom-left; draft date bottom-right.
  const bottom = MARGINS.bottom * PT_PER_IN + 4 * LINE;
  const left = MARGINS.left * PT_PER_IN;

  const contact = [
    ...(field(fields, 'contact', 'kontakt')?.values ?? []),
    ...(field(fields, 'notes')?.values ?? []),
    ...(field(fields, 'copyright', 'upphovsrätt')?.values ?? []),
  ];
  contact.forEach((value, i) => drawRuns(page, valueRuns(value), left, bottom + (contact.length - 1 - i) * LINE, fonts));

  const date = field(fields, 'draft date', 'date', 'datum', 'utkast', 'revision');
  (date?.values ?? []).forEach((value, i) => {
    const runs = valueRuns(value);
    const chars = runs.reduce((n, r) => n + r.text.length, 0);
    const right = widthPt - MARGINS.right * PT_PER_IN;
    drawRuns(page, runs, right - chars * CHAR, bottom + ((date?.values.length ?? 1) - 1 - i) * LINE, fonts);
  });
}

/* ========================================================================== */

export async function renderPdf(script: Script, fontBytes: PdfFonts, options: PdfOptions): Promise<Uint8Array> {
  const pagination =
    options.pagination ??
    paginate(script, {
      pageSize: options.pageSize,
      sceneNumbers: options.sceneNumbers ?? false,
      ...(options.moreLabel ? { moreLabel: options.moreLabel } : {}),
      ...(options.contdLabel ? { contdLabel: options.contdLabel } : {}),
    });

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const fonts: FontSet = {
    regular: await doc.embedFont(fontBytes.regular, { subset: true }),
    bold: await doc.embedFont(fontBytes.bold, { subset: true }),
    italic: await doc.embedFont(fontBytes.italic, { subset: true }),
    boldItalic: await doc.embedFont(fontBytes.boldItalic, { subset: true }),
  };
  const watermarkFont = await doc.embedFont(StandardFonts.HelveticaBold);

  // Decided on the source, then looked up by where each printed line came from.
  const isRevised =
    options.revisionBaseline === undefined ? NOTHING_REVISED : revisionMarks(options.revisionBaseline, script.source);

  const size = PAGE_SIZES[options.pageSize];
  const widthPt = size.widthIn * PT_PER_IN;
  const heightPt = size.heightIn * PT_PER_IN;

  const title = script.titlePage?.fields.find((f) => f.key === 'title' || f.key === 'titel')?.values.join(' ');
  const author = script.titlePage?.fields.find((f) => f.key === 'author' || f.key === 'authors' || f.key === 'författare')?.values.join(', ');
  if (title) doc.setTitle(styledChars(title).map((c) => c.ch).join(''));
  if (author) doc.setAuthor(author);
  doc.setCreator('A+ Write');
  doc.setProducer('A+ Write');

  if (options.titlePage !== false && script.titlePage && script.titlePage.fields.length > 0) {
    const page = doc.addPage([widthPt, heightPt]);
    drawTitlePage(page, script, fonts, widthPt, heightPt);
    if (options.watermark) drawWatermark(page, options.watermark, watermarkFont, widthPt, heightPt);
  }

  for (const body of pagination.pages) {
    const page = doc.addPage([widthPt, heightPt]);

    // No number on page one, by convention.
    if (body.number > 1) {
      const folio = `${body.number}.`;
      page.drawText(folio, {
        x: widthPt - MARGINS.right * PT_PER_IN - folio.length * CHAR,
        y: heightPt - 0.5 * PT_PER_IN - 9.5,
        size: FONT_SIZE,
        font: fonts.regular,
      });
    }

    // Only a page that has something revised on it says so, as on real
    // revised pages; an untouched page stays as it was.
    if (options.revisionLabel && body.rows.some((row) => row.some((line) => isRevised(line.from)))) {
      page.drawText(options.revisionLabel.toUpperCase(), {
        x: MARGINS.left * PT_PER_IN,
        y: heightPt - 0.5 * PT_PER_IN - 9.5,
        size: FONT_SIZE,
        font: fonts.regular,
      });
    }

    body.rows.forEach((row, index) => {
      const baseline = baselineFor(index, heightPt);
      for (const line of row) {
        drawRuns(page, line.runs, lineX(line), baseline, fonts);

        // Outside the text block and clear of the scene numbers, which sit
        // 0.75in in from the edge on a heading's row.
        if (isRevised(line.from)) {
          page.drawText('*', { x: widthPt - 0.4 * PT_PER_IN, y: baseline, size: FONT_SIZE, font: fonts.regular });
        }

        if (line.sceneNumber && options.sceneNumbers) {
          // Both margins: left just outside the text block, right past the edge.
          const n = line.sceneNumber;
          page.drawText(n, { x: (MARGINS.left - 0.75) * PT_PER_IN, y: baseline, size: FONT_SIZE, font: fonts.regular });
          page.drawText(n, {
            x: widthPt - (MARGINS.right - 0.25) * PT_PER_IN,
            y: baseline,
            size: FONT_SIZE,
            font: fonts.regular,
          });
        }
      }
    });

    if (options.watermark) drawWatermark(page, options.watermark, watermarkFont, widthPt, heightPt);
  }

  return doc.save();
}

/** A filename-safe version of the script's title. */
export function exportFileName(script: Script, extension: string): string {
  const raw = script.titlePage?.fields.find((f) => f.key === 'title' || f.key === 'titel')?.values.join(' ') ?? 'Manus';
  const plainTitle = styledChars(raw).map((c) => c.ch).join('');
  const safe = plainTitle.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Manus';
  return `${safe}.${extension}`;
}
