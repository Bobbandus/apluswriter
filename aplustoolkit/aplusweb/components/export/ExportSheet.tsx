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
import type { Revision } from '@aplus/fountain/revisions';
import styles from './ExportSheet.module.css';

export interface ExportSheetProps {
  open: boolean;
  onClose: () => void;
  source: string;
  pageSize: PageSize;
  pageCount: number | null;
  todoCount: number;
  /** Drafts the changes can be marked against. Nothing is offered without any. */
  revisions?: Revision[];
}

/**
 * Export: PDF or Fountain.
 *
 * Remembers the last choices, because a writer exports the same way every
 * time and should not have to re-tick scene numbers for each draft. The
 * watermark is not remembered — a script sent to one reader must never go
 * out stamped with the previous reader's name.
 */
export function ExportSheet({ open, onClose, source, pageSize, pageCount, todoCount, revisions = [] }: ExportSheetProps) {
  const t = useTranslations('importExport');
  const tSettings = useTranslations('settings');
  const tCommon = useTranslations('common');
  const tRevisions = useTranslations('revisions');
  const locale = useLocale() === 'en' ? 'en' : 'sv';

  const [format, setFormat] = usePersistentState<ExportFormat>('aplus.export.format', 'pdf');
  const [size, setSize] = useState<PageSize>(pageSize);
  const [sceneNumbers, setSceneNumbers] = usePersistentState('aplus.export.sceneNumbers', false);
  const [titlePage, setTitlePage] = usePersistentState('aplus.export.titlePage', true);
  const [watermark, setWatermark] = useState('');
  // Not remembered, like the watermark: what to mark against is a choice about
  // this particular export, and last week's draft is the wrong default.
  const [since, setSince] = useState('');
  const [report, setReport] = useState<'scenes' | 'characters' | 'locations'>('scenes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (revision: Revision) =>
    revision.kind === 'auto'
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(revision.createdAt)
      : revision.label || tRevisions(`colors.${revision.color ?? 'white'}`);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const baseline = revisions.find((revision) => revision.id === since);
      await runExport({
        source,
        format,
        pageSize: size,
        sceneNumbers,
        titlePage,
        watermark,
        locale,
        report,
        ...(baseline ? { revision: { baseline: baseline.content, label: t('changesSince', { name: nameOf(baseline) }) } } : {}),
      });
      setWatermark('');
      setSince('');
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
            { value: 'fdx', label: t('formatFdx'), icon: 'export' },
            { value: 'html', label: t('formatHtml'), icon: 'export' },
            { value: 'csv', label: t('formatReport'), icon: 'reports' },
          ]}
        />

        {format === 'csv' && (
          <SegmentedControl<'scenes' | 'characters' | 'locations'>
            label={t('formatReport')}
            value={report}
            onChange={setReport}
            fullWidth
            size="sm"
            options={[
              { value: 'scenes', label: tRevisions('reportScenes') },
              { value: 'characters', label: tRevisions('reportCharacters') },
              { value: 'locations', label: tRevisions('reportLocations') },
            ]}
          />
        )}

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

            {revisions.length > 0 && (
              <label className={styles.field}>
                <span className={styles.label}>{t('markChanges')}</span>
                <select className={styles.input} value={since} onChange={(event) => setSince(event.target.value)}>
                  <option value="">{t('markChangesNone')}</option>
                  {revisions.map((revision) => (
                    <option key={revision.id} value={revision.id}>
                      {nameOf(revision)}
                    </option>
                  ))}
                </select>
                {since && <span className={styles.meta}>{t('markChangesHint')}</span>}
              </label>
            )}

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
