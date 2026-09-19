'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Button } from './Button';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Buttons for the footer bar. Omit for a sheet the writer just reads. */
  footer?: ReactNode;
  /** Max width in px. */
  width?: number;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal sheet that drops out of the titlebar.
 *
 * Focus moves in on open, is trapped while open, and returns to whatever
 * opened it on close — a writer who hit ⌘, from the page lands back on the
 * page, with the caret where they left it.
 */
export function Sheet({ open, onClose, title, footer, width = 520, children }: SheetProps) {
  const t = useTranslations('common');
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // The page behind must not scroll while a modal is up.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const first = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const nodes = sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;

      // Wrap focus at both ends so Tab can never escape the sheet.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop dismisses —
        // otherwise a text selection dragged out of the sheet would close it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.sheet}
        style={{ ['--sheet-w' as string]: `${width}px` }}
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <Button variant="ghost" size="sm" icon="close" aria-label={t('close')} onClick={onClose} />
        </header>

        <div className={styles.body}>{children}</div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
