'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { parse } from '@aplus/fountain/parse';
import { TITLE_FIELDS, readTitleValues, titlePageEdit, type TitleValues } from '@aplus/fountain/titlePage';
import styles from './TitlePageSheet.module.css';

export interface TitlePageSheetProps {
  open: boolean;
  onClose: () => void;
  source: string;
  /** The change to make to the text; the workspace applies it as one undoable step. */
  onApply: (edit: { from: number; to: number; insert: string }) => void;
}

/**
 * The title page as a form. The script text stays the truth: this only reads
 * the block at the top and writes it back, and keys it does not show are left
 * as they were.
 */
export function TitlePageSheet({ open, onClose, source, onApply }: TitlePageSheetProps) {
  const t = useTranslations('titlePageForm');
  const tCommon = useTranslations('common');
  const script = useMemo(() => (open ? parse(source) : null), [open, source]);
  const [values, setValues] = useState<TitleValues | null>(null);

  // Start from what the file says each time the sheet opens, never from the last edit.
  useEffect(() => {
    setValues(open && script ? readTitleValues(script) : null);
    // Only when opening: typing must not be overwritten by the text catching up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    if (!script || !values) return;
    const edit = titlePageEdit(script, values);
    if (edit) onApply(edit);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('title')}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button variant="primary" onClick={save}>
            {tCommon('save')}
          </Button>
        </>
      }
    >
      {values && (
        <div className={styles.form}>
          {TITLE_FIELDS.map((field) => (
            <label key={field.key} className={styles.field}>
              <span className={styles.label}>{t(`fields.${field.key.replace(' ', '')}`)}</span>
              {field.multiline ? (
                <textarea
                  className={styles.area}
                  value={values[field.key]}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                />
              ) : (
                <input
                  className={styles.input}
                  value={values[field.key]}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                />
              )}
            </label>
          ))}
          <p className={styles.hint}>{t('hint')}</p>
        </div>
      )}
    </Sheet>
  );
}
