'use client';

import { useTranslations } from 'next-intl';
import styles from './SaveStatus.module.css';

/**
 * Every state the writer's work can be in. There is no "unknown" — if the app
 * cannot say where the text is, that is a bug, not a state.
 */
export type SaveState = 'saved' | 'saving' | 'syncing' | 'offline' | 'conflict' | 'error';

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
