'use client';

import { useTranslations } from 'next-intl';
import styles from './SaveStatus.module.css';

import type { SaveState } from '@/lib/storage/types';

export type { SaveState };

export interface SaveStatusProps {
  /** `null` renders nothing — used before a document is open. */
  state: SaveState | null;
}

export function SaveStatus({ state }: SaveStatusProps) {
  const t = useTranslations('status');

  if (!state) return null;

  return (
    <span
      className={[styles.status, styles[state]].join(' ')}
      // Save state changes matter but must not interrupt typing, so they are
      // announced politely rather than assertively.
      role="status"
      aria-live="polite"
    >
      <span className={styles.dot} aria-hidden="true" />
      {t(state)}
    </span>
  );
}
