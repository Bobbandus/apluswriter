'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatElapsed } from '@/lib/writing';
import styles from './WritingPill.module.css';

export interface WritingPillProps {
  /** Words added today in this script, or null while the count is not ready. */
  today: number | null;
  /** The running session, if any. */
  pass: { startedAt: number } | null;
  passWords: number | null;
  /** What the last session came to, shown for a few seconds after it ends. */
  result: { minutes: number; words: number } | null;
  onStart: () => void;
  onEnd: () => void;
}

/**
 * The writing counter: today's words, or the running session's time and words.
 * A click starts or ends a session. The clock ticks in here, not in the
 * workspace, so a second-by-second redraw never reaches the editor.
 */
export function WritingPill({ today, pass, passWords, result, onStart, onEnd }: WritingPillProps) {
  const t = useTranslations('writing');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pass) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pass]);

  if (today === null) return null;

  const label = pass
    ? `${formatElapsed(now - pass.startedAt)} · +${passWords ?? 0}`
    : result
      ? t('result', { minutes: result.minutes, words: result.words })
      : t('today', { words: today });

  return (
    <button
      type="button"
      className={`${styles.pill} ${pass ? styles.running : ''}`}
      onClick={pass ? onEnd : onStart}
      title={pass ? t('endHint') : t('startHint')}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
