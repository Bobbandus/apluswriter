'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Shotlist } from '@aplus/bridge/protocol';
import { parse } from '@aplus/fountain/parse';
import { paginate } from '@aplus/paginator/paginate';
import { readShotlists, refreshShotlists, shotlistCsv } from '@aplus/production/shotlist';
import { readBoard, refreshRefs, stripboardCsv, type Stripboard } from '@aplus/production/stripboard';
import { AccountButton } from '@/components/auth/AccountButton';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useToast } from '@/components/ui/Toast';
import { useUndoable } from '@/lib/hooks/useUndoable';
import { saveFile } from '@/lib/platform/files';
import { useProjectData, useProjectSource } from '@/lib/storage/hooks';
import { ShotlistView } from './ShotlistView';
import { StripboardView } from './StripboardView';
import styles from './ProductionWorkspace.module.css';

export type ProductionView = 'shotlist' | 'stripboard';

export interface ProductionWorkspaceProps {
  projectId: string;
  view: ProductionView;
}

/** A file name from the title: what a producer sees in their downloads folder. */
const fileName = (title: string, what: string) => `${title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Manus'} – ${what}.csv`;

/**
 * Planning from a script: its shotlists and its stripboard.
 *
 * The script is read, never edited, here — it stays the source of truth, and
 * both views are drawn from it every time they open (and whenever the tab
 * comes back into view). What is stored is only the planning itself, as
 * project data beside the script, which syncs with the project.
 */
export function ProductionWorkspace({ projectId, view }: ProductionWorkspaceProps) {
  const t = useTranslations('production');
  const tToolkit = useTranslations('toolkit');
  const router = useRouter();
  const project = useProjectSource(projectId);
  const [toast, say] = useToast(4200);

  const script = useMemo(() => parse(project.source), [project.source]);
  const pageSize = project.meta?.pageSize ?? 'a4';
  const eighths = useMemo(() => paginate(script, { pageSize }).sceneEighths, [script, pageSize]);

  const [storedLists, writeLists, listsReady] = useProjectData<unknown>(projectId, 'shotlists', []);
  const [storedBoard, writeBoard, boardReady] = useProjectData<unknown>(projectId, 'stripboard', null);
  const shotlists = useMemo(() => readShotlists(storedLists), [storedLists]);
  const board = useMemo(() => readBoard(storedBoard), [storedBoard]);

  const lists = useUndoable<readonly Shotlist[]>(shotlists, writeLists as (next: readonly Shotlist[]) => void, view === 'shotlist');
  const schedule = useUndoable<Stripboard>(board, writeBoard as (next: Stripboard) => void, view === 'stripboard');
  const active = view === 'shotlist' ? lists : schedule;

  const ready = project.status === 'ready' && listsReady && boardReady;

  // Keep stored pointers in step with the script, outside the undo history:
  // this is bookkeeping, not something the producer did.
  useEffect(() => {
    if (!ready) return;
    const refreshed = refreshShotlists(script.scenes, shotlists);
    if (refreshed !== shotlists) writeLists(refreshed);
  }, [ready, script, shotlists, writeLists]);

  useEffect(() => {
    if (!ready) return;
    const refreshed = refreshRefs(script.scenes, board);
    if (refreshed !== board) writeBoard(refreshed);
  }, [ready, script, board, writeBoard]);

  const title = project.meta?.title ?? '';

  const exportCsv = useCallback(async () => {
    const text = view === 'shotlist' ? shotlistCsv(script, shotlists) : stripboardCsv(script, eighths, board);
    await saveFile(fileName(title, view === 'shotlist' ? t('shotlist') : t('stripboard')), new Blob([text], { type: 'text/csv;charset=utf-8' }));
  }, [view, script, shotlists, eighths, board, title, t]);

  const switchView = (next: ProductionView) => {
    if (next !== view) router.push(`/plan/${next}/${projectId}`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <Link href="/" className={styles.brand}>
            A<span className={styles.plus}>+</span>
          </Link>
          <span aria-hidden="true" className={styles.sep}>
            /
          </span>
          <Link href="/plan" className={styles.crumb}>
            {tToolkit('plan.title')}
          </Link>
          <span aria-hidden="true" className={styles.sep}>
            /
          </span>
          <Link href={`/plan/${view}`} className={styles.crumb}>
            {t(view)}
          </Link>
          {title && (
            <span className={styles.project} title={title}>
              <span aria-hidden="true" className={styles.sep}>
                /
              </span>{' '}
              {title}
            </span>
          )}
        </nav>

        <SegmentedControl<ProductionView>
          className={styles.switch}
          size="sm"
          label={t('view')}
          value={view}
          onChange={switchView}
          options={[
            { value: 'shotlist', label: t('shotlist') },
            { value: 'stripboard', label: t('stripboard') },
          ]}
        />

        <div className={styles.actions}>
          <Button variant="ghost" size="sm" icon="undo" aria-label={t('undo')} title={t('undo')} disabled={!active.canUndo} onClick={active.undo} className={styles.undo} />
          <Button variant="ghost" size="sm" icon="redo" aria-label={t('redo')} title={t('redo')} disabled={!active.canRedo} onClick={active.redo} className={styles.undo} />
          <Menu
            trigger={(props) => (
              <Button {...props} variant="ghost" size="sm" icon="download" trailingIcon="chevronDown" disabled={!ready}>
                <span className={styles.hideNarrow}>{t('export')}</span>
              </Button>
            )}
            items={[
              { label: t('exportCsv'), icon: 'download', onSelect: () => void exportCsv() },
              { label: t('print'), icon: 'print', onSelect: () => window.print() },
            ]}
          />
          <Link href={`/app/${projectId}`} className={styles.openScript}>
            <span className={styles.hideNarrow}>{t('openScript')}</span>
            <span aria-hidden="true">→</span>
          </Link>
          <AccountButton />
        </div>
      </header>

      {project.status === 'missing' ? (
        <div className={styles.message}>
          <h1 className={styles.messageTitle}>{t('missingTitle')}</h1>
          <p className={styles.messageBody}>{t('missingBody')}</p>
          <Link href={`/plan/${view}`} className={styles.messageLink}>
            {t('allProjects')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : !ready ? (
        <p className={styles.loading} role="status">
          {t('loading')}
        </p>
      ) : script.scenes.length === 0 ? (
        <div className={styles.message}>
          <h1 className={styles.messageTitle}>{t('noScenesTitle')}</h1>
          <p className={styles.messageBody}>{t('noScenesBody')}</p>
          <Link href={`/app/${projectId}`} className={styles.messageLink}>
            {t('openScript')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : view === 'shotlist' ? (
        <ShotlistView script={script} eighths={eighths} title={title} lists={shotlists} set={lists.set} say={say} />
      ) : (
        <StripboardView script={script} eighths={eighths} title={title} board={board} set={schedule.set} say={say} />
      )}
      {toast}
    </div>
  );
}
