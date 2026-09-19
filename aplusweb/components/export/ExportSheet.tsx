'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Toggle } from '@/components/ui/Toggle';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { runExport, type ExportFormat } from '@/lib/export/runExport';
import type { PageSize } from '@aplus/paginator/geometry';
import styles from './ExportSheet.module.css';

export interface ExportSheetProps {
  open: boolean;
  onClose: () => void;
  source: string;
  pageSize: PageSize;
  pageCount: number | null;
  todoCount: number;
}

/**
 * Export: PDF or Fountain.
 *
 * Remembers the last choices, because a writer exports the same way every
 * time and should not have to re-tick scene numbers for each draft. The
 * watermark is not remembered — a script sent to one reader must never go
 * out stamped with the previous reader's name.
 */
export function ExportSheet({ open, onClose, source, pageSize, pageCount, todoCount }: ExportSheetProps) {
  const t = useTranslations('importExport');
  const tSettings = useTranslations('settings');
  const tCommon = useTranslations('common');
  const locale = useLocale() === 'en' ? 'en' : 'sv';

  const [format, setFormat] = usePersistentState<ExportFormat>('aplus.export.format', 'pdf');
  const [size, setSize] = useState<PageSize>(pageSize);
  const [sceneNumbers, setSceneNumbers] = usePersistentState('aplus.export.sceneNumbers', false);
  const [titlePage, setTitlePage] = usePersistentState('aplus.export.titlePage', true);
  const [watermark, setWatermark] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await runExport({ source, format, pageSize: size, sceneNumbers, titlePage, watermark, locale });
      setWatermark('');
      onClose();
    } catch (cause) {
      // A failed export must say so. Silently producing nothing is the worst
      // outcome: the writer thinks the file is on its way to the producer.
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('exportTitle')}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button variant="primary" icon="export" onClick={go} disabled={busy || !source.trim()}>
            {busy ? tCommon('loading') : t('export')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <SegmentedControl<ExportFormat>
          label={t('exportTitle')}
          value={format}
          onChange={setFormat}
          fullWidth
          options={[
            { value: 'pdf', label: t('formatPdf'), icon: 'export' },
            { value: 'fountain', label: t('formatFountain'), icon: 'write' },
          ]}
        />

        {format === 'pdf' && (
          <>
            <div className={styles.row}>
              <span className={styles.label}>{tSettings('pageSize')}</span>
              <SegmentedControl<PageSize>
                label={tSettings('pageSize')}
                value={size}
                onChange={setSize}
                size="sm"
                options={[
                  { value: 'a4', label: tSettings('pageSizeA4') },
                  { value: 'letter', label: tSettings('pageSizeLetter') },
                ]}
              />
            </div>

            <Toggle label={t('sceneNumbers')} checked={sceneNumbers} onChange={setSceneNumbers} />
            <Toggle label={t('titlePage')} checked={titlePage} onChange={setTitlePage} />

            <label className={styles.field}>
              <span className={styles.label}>{t('watermark')}</span>
              <input
                className={styles.input}
                value={watermark}
                onChange={(event) => setWatermark(event.target.value)}
                placeholder={t('watermarkPlaceholder')}
                maxLength={40}
              />
            </label>

            {pageCount !== null && size === pageSize && (
              <p className={styles.meta}>{t('pageCount', { count: pageCount })}</p>
            )}
          </>
        )}

        {todoCount > 0 && (
          <p className={styles.warning} role="note">
            {t('todosRemain', { count: todoCount })} {t('todosRemainHint')}
          </p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {t('exportFailed')} {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
