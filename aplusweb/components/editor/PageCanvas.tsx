'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { FONT_SIZE_PT, LPI, MARGINS, PAGE_SIZES, type PageSize } from '@aplus/paginator/geometry';
import styles from './PageCanvas.module.css';

const ZOOM_STEPS = [0.6, 0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;
const ONE_TO_ONE = 3;

/** Fit keeps a gutter either side so the page never kisses the pane edge. */
const FIT_GUTTER_PX = 56;
// Low enough that a cramped window still shows a whole page rather than
// cutting the right margin off; a real desktop window lands near 1.
const FIT_MIN = 0.35;
const FIT_MAX = 1.25;

/** `'fit'` follows the pane width; a number is a fixed step the writer chose. */
type ZoomMode = 'fit' | number;

export interface PageCanvasProps {
  pageSize: PageSize;
  /** Page content. When absent the canvas shows its empty state. */
  children?: ReactNode;
  /** Sits above the page, sticky — the element bar. Never on the paper. */
  toolbar?: ReactNode;
}

/**
 * The paper the script sits on.
 *
 * Every dimension comes from `@aplus/paginator/geometry`, expressed as CSS
 * custom properties in real inches. That is what guarantees the sheet on
 * screen has the same measure as the exported PDF — the two cannot disagree,
 * because neither owns the numbers.
 *
 * Zoom defaults to **fit width**. A fixed 100% A4 page is 794px wide, so in a
 * laptop window with both side panes open it simply does not fit, and the
 * writer ends up scrolling sideways to read their own dialogue.
 */
export function PageCanvas({ pageSize, children, toolbar }: PageCanvasProps) {
  const t = useTranslations('editor');
  const canvasRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = usePersistentState<ZoomMode>('aplus.ui.zoomMode', 'fit');
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const page = PAGE_SIZES[pageSize];
  const pagePx = page.widthIn * 96;

  const fitZoom =
    width > 0 ? Math.min(FIT_MAX, Math.max(FIT_MIN, (width - FIT_GUTTER_PX) / pagePx)) : 1;
  const zoom = mode === 'fit' ? fitZoom : (ZOOM_STEPS[mode] ?? 1);

  /** The step nearest the current zoom, so +/- continue from where fit left it. */
  const nearestStep = useCallback(() => {
    let best = 0;
    ZOOM_STEPS.forEach((step, index) => {
      if (Math.abs(step - zoom) < Math.abs((ZOOM_STEPS[best] ?? 1) - zoom)) best = index;
    });
    return best;
  }, [zoom]);

  const zoomIn = useCallback(
    () => setMode(Math.min(ZOOM_STEPS.length - 1, nearestStep() + 1)),
    [nearestStep, setMode],
  );
  const zoomOut = useCallback(() => setMode(Math.max(0, nearestStep() - 1)), [nearestStep, setMode]);
  const toggleFit = useCallback(
    () => setMode((current) => (current === 'fit' ? ONE_TO_ONE : 'fit')),
    [setMode],
  );

  useHotkeys({
    'mod+=': zoomIn,
    'mod+-': zoomOut,
    'mod+0': toggleFit,
  });

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
    <div ref={canvasRef} className={styles.canvas} style={vars} id="script">
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}

      <div className={styles.sheet}>
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
            disabled={zoom <= (ZOOM_STEPS[0] ?? 0.6)}
          />
        </Tooltip>

        <Tooltip label={t('zoomFit')} shortcut="mod+0" placement="top">
          <button
            type="button"
            className={styles.zoomValue}
            data-fit={mode === 'fit'}
            onClick={toggleFit}
          >
            {mode === 'fit' ? t('zoomFitShort') : `${Math.round(zoom * 100)}%`}
          </button>
        </Tooltip>

        <Tooltip label={t('zoomIn')} shortcut="mod+=" placement="top">
          <Button
            variant="ghost"
            size="sm"
            icon="chevronUp"
            aria-label={t('zoomIn')}
            onClick={zoomIn}
            disabled={zoom >= (ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 2)}
          />
        </Tooltip>
      </div>
    </div>
  );
}
