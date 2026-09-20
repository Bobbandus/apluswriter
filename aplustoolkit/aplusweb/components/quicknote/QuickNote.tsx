'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import styles from './QuickNote.module.css';

export interface QuickNoteProps {
  open: boolean;
  onClose: () => void;
  /** Called with the text; the caller decides where it goes. */
  onSubmit: (note: string) => void;
}

/** One line to catch a thought and go straight back to the page. Enter saves, Esc drops it. */
export function QuickNote({ open, onClose, onSubmit }: QuickNoteProps) {
  const t = useTranslations('quickNote');
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue('');
    input.current?.focus();
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onClose}>
      <form
        className={styles.panel}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSubmit(value);
          onClose();
        }}
      >
        <input
          ref={input}
          className={styles.input}
          value={value}
          placeholder={t('placeholder')}
          aria-label={t('label')}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Enter is handled here rather than left to the form, so it works the same everywhere.
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (value.trim()) onSubmit(value);
              onClose();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        />
      </form>
    </div>,
    document.body,
  );
}
