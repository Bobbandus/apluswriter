'use client';

import { parse } from '@aplus/fountain/parse';
import { serialize } from '@aplus/fountain/serialize';
import type { PageSize } from '@aplus/paginator/geometry';
import { saveFile } from '@/lib/platform/files';

export type ExportFormat = 'pdf' | 'fountain';

export interface ExportRequest {
  source: string;
  format: ExportFormat;
  pageSize: PageSize;
  sceneNumbers: boolean;
  titlePage: boolean;
  watermark: string;
  locale: 'sv' | 'en';
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
    moreLabel: request.locale === 'en' ? '(MORE)' : '(MER)',
    contdLabel: request.locale === 'en' ? "(CONT'D)" : '(FORTS.)',
  });

  const name = exportFileName(script, 'pdf');
  await saveFile(name, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  return name;
}
