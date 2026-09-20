'use client';

import { parse } from '@aplus/fountain/parse';
import { serialize } from '@aplus/fountain/serialize';
import type { PageSize } from '@aplus/paginator/geometry';
import { saveFile } from '@/lib/platform/files';

export type ExportFormat = 'pdf' | 'fountain' | 'fdx' | 'html' | 'csv';

export interface ExportRequest {
  source: string;
  format: ExportFormat;
  pageSize: PageSize;
  sceneNumbers: boolean;
  titlePage: boolean;
  watermark: string;
  locale: 'sv' | 'en';
  /** Which report a CSV export holds. */
  report?: 'scenes' | 'characters' | 'locations';
  /** An earlier draft to mark changes against, and what to call it on the page. */
  revision?: { baseline: string; label: string };
}

let fontCache: Promise<{
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
}> | null = null;

/** Courier Prime, fetched once and kept for the session. */
function loadFonts() {
  if (!fontCache) {
    const get = async (name: string) =>
      new Uint8Array(await (await fetch(`/fonts/CourierPrime-${name}.ttf`)).arrayBuffer());
    fontCache = Promise.all([get('Regular'), get('Bold'), get('Italic'), get('BoldItalic')]).then(
      ([regular, bold, italic, boldItalic]) => ({ regular, bold, italic, boldItalic }),
    );
  }
  return fontCache;
}

/**
 * Builds the export and hands it to the platform to save.
 *
 * The PDF library is imported only here, on demand. It is several hundred
 * kilobytes, and a writer who never exports should never download it.
 */
export async function runExport(request: ExportRequest): Promise<string> {
  const script = parse(request.source);
  const { exportFileName, renderPdf } = await import('@aplus/export/pdf');

  if (request.format === 'html') {
    const { renderHtml } = await import('@aplus/export/html');
    const name = exportFileName(script, 'html');
    await saveFile(name, new Blob([renderHtml(script, name.replace(/\.html$/, ''))], { type: 'text/html;charset=utf-8' }));
    return name;
  }

  if (request.format === 'csv') {
    const { renderReport } = await import('@aplus/export/reports');
    const kind = request.report ?? 'scenes';
    const name = exportFileName(script, 'csv').replace(/\.csv$/, ` - ${kind}.csv`);
    await saveFile(name, new Blob([renderReport(kind, script)], { type: 'text/csv;charset=utf-8' }));
    return name;
  }

  if (request.format === 'fdx') {
    const { renderFdx } = await import('@aplus/export/fdx');
    const name = exportFileName(script, 'fdx');
    await saveFile(name, new Blob([renderFdx(script)], { type: 'application/xml;charset=utf-8' }));
    return name;
  }

  if (request.format === 'fountain') {
    const name = exportFileName(script, 'fountain');
    await saveFile(name, new Blob([serialize(script)], { type: 'text/plain;charset=utf-8' }));
    return name;
  }

  const bytes = await renderPdf(script, await loadFonts(), {
    pageSize: request.pageSize,
    sceneNumbers: request.sceneNumbers,
    titlePage: request.titlePage,
    ...(request.watermark.trim() ? { watermark: request.watermark.trim() } : {}),
    ...(request.revision ? { revisionBaseline: request.revision.baseline, revisionLabel: request.revision.label } : {}),
    moreLabel: request.locale === 'en' ? '(MORE)' : '(MER)',
    contdLabel: request.locale === 'en' ? "(CONT'D)" : '(FORTS.)',
  });

  const name = exportFileName(script, 'pdf');
  await saveFile(name, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  return name;
}
