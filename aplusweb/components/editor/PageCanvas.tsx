'use client';

import { useCallback, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { FONT_SIZE_PT, LPI, MARGINS, PAGE_SIZES, type PageSize } from '@aplus/paginator/geometry';
import styles from './PageCanvas.module.css';

const ZOOM_STEPS = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;
const DEFAULT_ZOOM_INDEX = 2;

export interface PageCanvasProps {
  pageSize: PageSize;
  /** Page content. When absent the canvas shows its empty state. */
  children?: ReactNode;
  /** Page numbers are suppressed on page one, per convention. */
  pageNumber?: number;
}

/**
 * The paper the script sits on.
 *
 * Every dimension comes from `lib/paginator/geometry`, expressed as CSS custom
 * properties in real inches. That is what guarantees the sheet on screen has
 * the same measure as the exported PDF — the two cannot disagree, because
 * neither owns the numbers.
 */
export function PageCanvas({ pageSize, children, pageNumber }: PageCanvasProps) {
  const t = useTranslations('editor');

  const [zoomIndex, setZoomIndex] = usePersistentState('aplus.ui.zoom', DEFAULT_ZOOM_INDEX);
  const zoom = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex))] ?? 1;

  const zoomIn = useCallback(
    () => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1)),
    [setZoomIndex],
  );
  const zoomOut = useCallback(() => setZoomIndex((i) => Math.max(0, i - 1)), [setZoomIndex]);
  const zoomReset = useCallback(() => setZoomIndex(DEFAULT_ZOOM_INDEX), [setZoomIndex]);

  useHotkeys({
    'mod+=': zoomIn,
    'mod+-': zoomOut,
    'mod+0': zoomReset,
  });

  const page = PAGE_SIZES[pageSize];

  // Inches are handed to CSS as real `in` units rather than pre-multiplied
  // pixels, so the browser does the DPI maths and the page stays honest.
  const vars: CSSProperties = {
    ['--zoom' as string]: zoom,
    ['--page-w' as string]: `calc(${page.widthIn}in * ${zoom})`,
    ['--page-h' as string]: `calc(${page.heightIn}in * ${zoom})`,
    ['--page-mt' as string]: `calc(${MARGINS.top}in * ${zoom})`,
    ['--page-mr' as string]: `calc(${MARGINS.right}in * ${zoom})`,
    ['--page-mb' as string]: `calc(${MARGINS.bottom}in * ${zoom})`,
    ['--page-ml' as string]: `calc(${MARGINS.left}in * ${zoom})`,
    ['--script-size' as string]: `calc(${FONT_SIZE_PT}pt * ${zoom})`,
    // One single-spaced line is exactly 1/6 inch. Setting the leading in
    // inches rather than as a unitless multiple keeps the line grid exact.
    ['--script-leading' as string]: `calc(${1 / LPI}in * ${zoom})`,
  };

  return (
    <div className={styles.canvas} style={vars} id="script">
      <div className={styles.sheet}>
        {pageNumber !== undefined && pageNumber > 1 && (
          <span className={styles.folio} aria-hidden="true">
            {pageNumber}.
          </span>
        )}

        <div className={styles.body}>
          {children ?? (
            <div className={styles.empty}>
              <p className={styles.emptyHeading}>{t('placeholder')}</p>
              <p className={styles.emptyHint}>{t('placeholderHint')}</p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.zoomBar}>
        <Tooltip label={t('zoomOut')} shortcut="mod+-" placement="top">
          <Button
            variant="ghost"
            size="sm"
            icon="chevronDown"
            aria-label={t('zoomOut')}
            onClick={zoomOut}
            disabled={zoomIndex <= 0}
          />
        </Tooltip>

        <Tooltip label={t('zoomReset')} shortcut="mod+0" placement="top">
          <button type="button" className={styles.zoomValue} onClick={zoomReset}>
            {Math.round(zoom * 100)}%
          </button>
        </Tooltip>

        <Tooltip label={t('zoomIn')} shortcut="mod+=" placement="top">
          <Button
            variant="ghost"
            size="sm"
            icon="chevronUp"
            aria-label={t('zoomIn')}
            onClick={zoomIn}
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
          />
        </Tooltip>
      </div>
    </div>
  );
}
