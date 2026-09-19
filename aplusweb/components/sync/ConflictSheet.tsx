'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { DiffView } from '@/components/ui/DiffView';
import type { Conflict } from '@/lib/storage/sync';

export interface ConflictSheetProps {
  conflict: Conflict | null;
  /** The writer's own text, as it is in the editor now. */
  mine: string;
  onResolve: (choice: 'mine' | 'theirs') => Promise<void>;
}

/**
 * "The script changed somewhere else."
 *
 * Shown when a save was refused because another computer saved first. It
 * cannot be dismissed without choosing, because dismissing it would leave the
 * writer editing a copy that silently never saves — but choosing is never
 * forced to be destructive either: "keep mine" is always one click.
 */
export function ConflictSheet({ conflict, mine, onResolve }: ConflictSheetProps) {
  const t = useTranslations('conflict');
  const [busy, setBusy] = useState(false);

  if (!conflict) return null;

  const choose = async (choice: 'mine' | 'theirs') => {
    setBusy(true);
    try {
      await onResolve(choice);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      // Closing without choosing is not an option; the sheet stays until they do.
      onClose={() => undefined}
      title={t('title')}
      width={680}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => void choose('theirs')}>
            {t('keepTheirs')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void choose('mine')}>
            {t('keepMine')}
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 'var(--s-4)', color: 'var(--text-muted)', lineHeight: 1.55 }}>{t('body')}</p>
      <DiffView before={conflict.content} after={mine} beforeLabel={t('theirsLabel')} afterLabel={t('mineLabel')} />
    </Sheet>
  );
}
