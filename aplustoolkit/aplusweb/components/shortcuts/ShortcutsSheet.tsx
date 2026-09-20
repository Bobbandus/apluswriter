'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { detectPlatform } from '@/lib/platform/keys';
import { SHORTCUT_ACTIONS, eventToBinding, formatBinding, useShortcuts, type ShortcutId } from '@/lib/shortcuts';
import styles from './ShortcutsSheet.module.css';

export interface ShortcutsSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Every shortcut the app has, each changeable. Click one, press the new chord.
 * A chord that something else already uses, or that the browser or editor owns,
 * is refused with the reason, never silently taken over.
 */
export function ShortcutsSheet({ open, onClose }: ShortcutsSheetProps) {
  const t = useTranslations('shortcuts');
  const { binding, overrides, set, reset } = useShortcuts();
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRecording(null);
      setProblem(null);
    }
  }, [open]);

  // While one is being recorded the sheet must not also close on Escape, which cancels the recording.
  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setRecording(null);
        setProblem(null);
        return;
      }
      const chord = eventToBinding(event, detectPlatform() === 'mac');
      if (!chord) return;
      event.preventDefault();
      event.stopPropagation();
      const result = set(recording, chord);
      if (result === null) {
        setRecording(null);
        setProblem(null);
      } else if (result === 'reserved') {
        setProblem(t('reserved', { keys: formatBinding(chord) }));
      } else {
        setProblem(t('taken', { keys: formatBinding(chord), action: t(`actions.${result}`) }));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, set, t]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('title')}
      width={480}
      footer={
        <Button variant="ghost" onClick={reset} disabled={Object.keys(overrides).length === 0}>
          {t('resetAll')}
        </Button>
      }
    >
      <ul className={styles.list}>
        {SHORTCUT_ACTIONS.map((action) => {
          const changed = overrides[action.id] !== undefined;
          return (
            <li key={action.id} className={styles.row}>
              <span className={styles.name}>{t(`actions.${action.id}`)}</span>
              <button
                type="button"
                className={styles.chord}
                data-recording={recording === action.id}
                data-changed={changed}
                onClick={() => {
                  setProblem(null);
                  setRecording(recording === action.id ? null : action.id);
                }}
              >
                {recording === action.id ? t('press') : formatBinding(binding(action.id))}
              </button>
              {changed && (
                <button type="button" className={styles.undo} onClick={() => set(action.id, null)} aria-label={t('reset', { action: t(`actions.${action.id}`) })}>
                  ↺
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.problem} role="status">
        {problem ?? ''}
      </p>
    </Sheet>
  );
}
