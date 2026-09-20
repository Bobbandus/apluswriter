import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { parse } from '../fountain/parse';
import { paginate } from '../paginator/paginate';
import { exportFileName, renderPdf, type PdfFonts } from './pdf';

const fontDir = join(process.cwd(), 'aplusweb/public/fonts');
const fonts: PdfFonts = {
  regular: readFileSync(join(fontDir, 'CourierPrime-Regular.ttf')),
  bold: readFileSync(join(fontDir, 'CourierPrime-Bold.ttf')),
  italic: readFileSync(join(fontDir, 'CourierPrime-Italic.ttf')),
  boldItalic: readFileSync(join(fontDir, 'CourierPrime-BoldItalic.ttf')),
};

const fixture = (name: string) => readFileSync(join(process.cwd(), 'fixtures/official', name), 'utf8');

describe('PDF export', () => {
  /**
   * The promise the whole paginator exists to keep: the PDF has exactly the
   * pages the screen showed. Both come from one pagination, so this checks the
   * exporter adds no pages of its own and drops none.
   */
  it('has one page per paginated page, plus the title page', async () => {
    const script = parse(fixture('Brick-And-Steel.fountain'));
    const pagination = paginate(script, { pageSize: 'a4' });
    const bytes = await renderPdf(script, fonts, { pageSize: 'a4', pagination });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(pagination.pages.length + 1);
  }, 20_000);

  it('uses the real paper size', async () => {
    const script = parse('INT. ROOM - DAY\n\nHello.');
    for (const [size, width, height] of [
      ['a4', 595.3, 841.9],
      ['letter', 612, 792],
    ] as const) {
      const pdf = await PDFDocument.load(await renderPdf(script, fonts, { pageSize: size }));
      const page = pdf.getPage(0);
      expect(page.getWidth()).toBeCloseTo(width, 0);
      expect(page.getHeight()).toBeCloseTo(height, 0);
    }
  }, 20_000);

  it('can leave the title page out', async () => {
    const script = parse(fixture('Brick-And-Steel.fountain'));
    const pagination = paginate(script, { pageSize: 'letter' });
    const pdf = await PDFDocument.load(
      await renderPdf(script, fonts, { pageSize: 'letter', pagination, titlePage: false }),
    );
    expect(pdf.getPageCount()).toBe(pagination.pages.length);
  }, 20_000);

  it('renders a full feature without choking', async () => {
    const script = parse(fixture('Big-Fish.fountain'));
    const bytes = await renderPdf(script, fonts, { pageSize: 'letter', sceneNumbers: true, watermark: 'VILDE' });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(100);
    // Fonts are subset, so a 125-page feature stays small enough to email.
    expect(bytes.length).toBeLessThan(1_500_000);
  }, 60_000);

  it('writes sample files for a visual check when asked', async () => {
    if (!process.env['APLUS_WRITE_PDF_SAMPLES']) return;
    const out = process.env['APLUS_WRITE_PDF_SAMPLES'];
    const script = parse(fixture('Brick-And-Steel.fountain'));
    writeFileSync(join(out, 'brick-and-steel.pdf'), await renderPdf(script, fonts, { pageSize: 'letter', sceneNumbers: true, watermark: 'Noa-Li' }));
  }, 20_000);
});

describe('exportFileName', () => {
  it('uses the title without its markup', () => {
    expect(exportFileName(parse(fixture('Brick-And-Steel.fountain')), 'pdf')).toBe('BRICK & STEEL FULL RETIRED.pdf');
  });

  it('falls back when there is no title', () => {
    expect(exportFileName(parse('INT. ROOM - DAY'), 'fountain')).toBe('Manus.fountain');
  });
});


/**
 * How many times text is drawn, counted in the page content streams.
 *
 * The fonts are embedded subsets, so a glyph shows up as a hex code and the
 * text itself cannot be searched. Each draw is a `Tj`, though, and that is
 * enough to say exactly how many things a revision added to the pages.
 */
async function textDraws(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes);
  let count = 0;
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    const parts = contents instanceof PDFArray ? contents.asArray().map((ref) => pdf.context.lookup(ref)) : [contents];
    for (const part of parts) {
      if (part instanceof PDFRawStream) {
        count += (Buffer.from(decodePDFRawStream(part).decode()).toString('latin1').match(/Tj/g) ?? []).length;
      }
    }
  }
  return count;
}

describe('revision marks', () => {
  const OLD = 'INT. A - DAG\n\nEtt.\n\nEXT. B - NATT\n\nTvå.\n';
  const render = (source: string, options: { revisionBaseline?: string; revisionLabel?: string } = {}) =>
    renderPdf(parse(source), fonts, { pageSize: 'a4', titlePage: false, ...options });

  it('draws nothing extra when nothing changed', async () => {
    const plain = await textDraws(await render(OLD));
    expect(await textDraws(await render(OLD, { revisionBaseline: OLD }))).toBe(plain);
  });

  it('draws one asterisk for each line that changed, and no more', async () => {
    const plain = await textDraws(await render(OLD));

    const oneChanged = OLD.replace('Ett.', 'Ett och lite till.');
    expect(await textDraws(await render(oneChanged, { revisionBaseline: OLD }))).toBe(plain + 1);

    const twoChanged = oneChanged.replace('Två.', 'Två också.');
    expect(await textDraws(await render(twoChanged, { revisionBaseline: OLD }))).toBe(plain + 2);
  });

  it('names the revision on a page that has something revised on it', async () => {
    const changed = OLD.replace('Ett.', 'Ett och lite till.');
    const plain = await textDraws(await render(changed, { revisionBaseline: OLD }));
    // One page, so one label on top of the asterisk.
    expect(await textDraws(await render(changed, { revisionBaseline: OLD, revisionLabel: 'Blå revision' }))).toBe(plain + 1);
  });

  // A page nobody touched is left exactly as it was, label or no label.
  it('leaves an untouched page unlabelled', async () => {
    const plain = await textDraws(await render(OLD));
    expect(await textDraws(await render(OLD, { revisionBaseline: OLD, revisionLabel: 'Blå revision' }))).toBe(plain);
  });
});
