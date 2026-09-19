'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import type { DictionaryData, DictionaryKind } from '@aplus/fountain/autocomplete';
import styles from './DictionarySheet.module.css';

export interface DictionarySheetProps {
  open: boolean;
  onClose: () => void;
  dictionary: DictionaryData;
  onRename: (kind: DictionaryKind, from: string, to: string) => void;
  onRemove: (kind: DictionaryKind, value: string) => void;
  onMerge: (kind: DictionaryKind, from: string, into: string) => void;
  onRebuild: () => void;
}

const KINDS: DictionaryKind[] = ['character', 'location', 'tag'];

/** The editable, local vocabulary behind autofinish — never a hidden AI list. */
export function DictionarySheet(props: DictionarySheetProps) {
  const t = useTranslations('dictionary');
  const tAuto = useTranslations('autocomplete');
  const tChars = useTranslations('characters');
  const tLocs = useTranslations('locations');
  const [editing, setEditing] = useState<{ kind: DictionaryKind; value: string } | null>(null);

  const labels: Record<DictionaryKind, string> = {
    character: tChars('title'), location: tLocs('title'), tag: tAuto('tags'),
  };
  const values = (kind: DictionaryKind) => props.dictionary[`${kind}s` as keyof DictionaryData] as string[];
  const options = useMemo(() => (editing ? values(editing.kind).filter((value) => value !== editing.value) : []), [editing, props.dictionary]);

  return (
    <Sheet open={props.open} onClose={props.onClose} title={t('title')} width={620}
      footer={<Button variant="secondary" onClick={props.onRebuild}>{t('rebuild')}</Button>}>
      <p className={styles.description}>{t('description')}</p>
      {KINDS.map((kind) => (
        <section key={kind} className={styles.group}>
          <h3>{labels[kind]}</h3>
          {values(kind).length === 0 ? <p className={styles.empty}>—</p> : (
            <ul className={styles.list}>
              {values(kind).map((value) => (
                <li key={value} className={styles.row}>
                  <span>{value}</span>
                  <div className={styles.actions}>
                    <Button size="sm" variant="subtle" onClick={() => setEditing({ kind, value })}>{t('renameEverywhere')}</Button>
                    <Button size="sm" variant="ghost" icon="close" aria-label={t('removeItem')} onClick={() => props.onRemove(kind, value)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {editing && (
        <div className={styles.editor}>
          <label htmlFor="dictionary-name">{t('renameEverywhere')}</label>
          <input id="dictionary-name" autoFocus defaultValue={editing.value} onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const next = event.currentTarget.value.trim();
            if (next && next !== editing.value) props.onRename(editing.kind, editing.value, next);
            setEditing(null);
          }} />
          {options.length > 0 && (
            <label className={styles.merge}>
              {t('merge')}
              <select defaultValue="" onChange={(event) => {
                const into = event.currentTarget.value;
                if (into) { props.onMerge(editing.kind, editing.value, into); setEditing(null); }
              }}>
                <option value="">—</option>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}
          <p>{t('renameEverywhereHint')}</p>
        </div>
      )}
    </Sheet>
  );
}
