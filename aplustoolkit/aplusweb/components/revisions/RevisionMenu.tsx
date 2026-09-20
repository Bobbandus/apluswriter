'use client';

import { useState, type CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { DiffView } from '@/components/ui/DiffView';
import { Sheet } from '@/components/ui/Sheet';
import { nextColor, type Revision, type RevisionColor } from '@aplus/fountain/revisions';
import styles from './RevisionMenu.module.css';

/** Pale enough to read as paper: these are the colours revised pages are printed on. */
const PAPER: Record<RevisionColor, string> = {
  white: '#f4f2ec',
  blue: '#a9c8ff',
  pink: '#ffb7d5',
  yellow: '#fff3a3',
  green: '#b6e8b0',
  goldenrod: '#e8c56b',
  buff: '#e9d8b4',
  salmon: '#ffb59c',
  cherry: '#e0687e',
};

export interface RevisionMenuProps {
  open: boolean;
  onClose: () => void;
  revisions: Revision[];
  /** The script as it is now, which every comparison is against. */
  current: string;
  onSave: (label: string) => Promise<void>;
  onRestore: (revision: Revision) => void;
}

/**
 * Drafts of the script: issue one, look back at one, go back to one.
 *
 * Restoring is not destructive and does not ask. The text as it stands is kept
 * first, and the restore goes into the editor as one edit, so it is undone
 * with Ctrl+Z like anything else. A confirmation dialog is the wrong tool for
 * something that cannot lose work.
 */
export function RevisionMenu({ open, onClose, revisions, current, onSave, onRestore }: RevisionMenuProps) {
  const t = useTranslations('revisions');
  const locale = useLocale();
  const [label, setLabel] = useState('');
  const [comparing, setComparing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const named = revisions.filter((revision) => revision.kind === 'named');
  const auto = revisions.filter((revision) => revision.kind === 'auto');
  const next = nextColor(revisions);

  const when = (time: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(time);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(label);
      setLabel('');
    } finally {
      setBusy(false);
    }
  };

  const row = (revision: Revision) => (
    <li key={revision.id} className={styles.row}>
      <div className={styles.line}>
        <span
          className={styles.paper}
          style={{ ['--paper' as string]: PAPER[revision.color ?? 'white'] } as CSSProperties}
          data-auto={revision.kind === 'auto' || undefined}
          aria-hidden="true"
        />
        <span className={styles.text}>
          <span className={styles.name}>
            {revision.kind === 'named' ? revision.label || t(`colors.${revision.color ?? 'white'}`) : t('autoLabel')}
          </span>
          <span className={styles.when}>{when(revision.createdAt)}</span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={comparing === revision.id}
          onClick={() => setComparing(comparing === revision.id ? null : revision.id)}
        >
          {t('compare')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onRestore(revision)}>
          {t('restore')}
        </Button>
      </div>
      {comparing === revision.id && (
        <div className={styles.diff}>
          <DiffView
            before={revision.content}
            after={current}
            context={1}
            emptyLabel={t('identical')}
            beforeLabel={t('thisDraft')}
            afterLabel={t('now')}
          />
        </div>
      )}
    </li>
  );

  return (
    <Sheet open={open} onClose={onClose} title={t('title')} width={600}>
      <form
        className={styles.save}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <span
          className={styles.paper}
          style={{ ['--paper' as string]: PAPER[next] } as CSSProperties}
          aria-hidden="true"
        />
        <input
          className={styles.input}
          value={label}
          placeholder={t('labelPlaceholder', { color: t(`colors.${next}`) })}
          aria-label={t('label')}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          {t('saveAs', { color: t(`colors.${next}`) })}
        </Button>
      </form>

      {named.length === 0 && auto.length === 0 && <p className={styles.empty}>{t('empty')}</p>}

      {named.length > 0 && <ul className={styles.list}>{named.map(row)}</ul>}

      {auto.length > 0 && (
        <details className={styles.auto}>
          <summary>{t('autoTitle', { count: auto.length })}</summary>
          <ul className={styles.list}>{auto.map(row)}</ul>
        </details>
      )}

      <p className={styles.hint}>{t('restoreHint')}</p>
    </Sheet>
  );
}
