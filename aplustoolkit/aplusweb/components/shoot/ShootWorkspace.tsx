'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { setCurrent } from '@aplus/shoot/set';
import { AccountButton } from '@/components/auth/AccountButton';
import { DayView } from './DayView';
import { GearView } from './GearView';
import { ReportView } from './ReportView';
import { ShotsView } from './ShotsView';
import { TakeLog } from './TakeLog';
import { dayName, todaysDay, useShootProject } from './useShootProject';
import styles from './Shoot.module.css';

export const SHOOT_TABS = ['day', 'shots', 'log', 'gear', 'report'] as const;
export type ShootTab = (typeof SHOOT_TABS)[number];

/**
 * A+ Shoot for one script: the day's callsheet, the shotlist on set, the take
 * log, gear and the wrap report, with the slate one tap away. Everything the
 * set changes is saved beside the script and syncs like the rest of it.
 */
export function ShootWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations('shoot.set');
  const tToolkit = useTranslations('toolkit');
  const locale = useLocale();
  const p = useShootProject(projectId);
  const [tab, setTabState] = useState<ShootTab>('day');
  const [focusScene, setFocusScene] = useState<number | null>(null);
  const pickedDay = useRef(false);

  // The tab survives a trip to the slate and back.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if ((SHOOT_TABS as readonly string[]).includes(fromHash)) setTabState(fromHash as ShootTab);
  }, []);
  const setTab = (next: ShootTab) => {
    setTabState(next);
    window.history.replaceState(null, '', `#${next}`);
  };

  // On the first visit of a day, open on that day.
  useEffect(() => {
    if (p.status !== 'ready' || pickedDay.current) return;
    pickedDay.current = true;
    const today = todaysDay(p.days);
    if (today && p.shoot.current.day !== today.id) p.update((d) => setCurrent(d, { day: today.id }));
  }, [p]);

  const openScene = (index: number) => {
    setFocusScene(index);
    setTab('shots');
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
          <Link href="/shoot">{tToolkit('shoot.title')}</Link>
          {p.title && (
            <>
              <span aria-hidden="true" className={styles.sep}>
                /
              </span>
              <span className={styles.project} title={p.title}>
                {p.title}
              </span>
            </>
          )}
        </nav>

        {p.status === 'ready' && (
          <select
            className={styles.daySelect}
            aria-label={t('day')}
            value={p.day?.id ?? ''}
            onChange={(e) => p.update((d) => setCurrent(d, { day: e.target.value || null }))}
          >
            <option value="">{t('allScenes')}</option>
            {p.days.map((day) => (
              <option key={day.id} value={day.id}>
                {dayName(day, t, locale)}
              </option>
            ))}
          </select>
        )}

        <Link href={`/shoot/${projectId}/klappa`} className={styles.slateButton}>
          {t('openSlate')}
        </Link>
        <AccountButton />
      </header>

      <div className={styles.tabs} role="tablist" aria-label={t('views')}>
        {SHOOT_TABS.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} className={styles.tab} onClick={() => setTab(name)}>
            {t(`tab.${name}`)}
          </button>
        ))}
      </div>

      <main className={styles.main}>
        {p.status === 'missing' ? (
          <div className={styles.message}>
            <h1 className={styles.messageTitle}>{t('missingTitle')}</h1>
            <p className={styles.muted}>{t('missingBody')}</p>
            <Link href="/shoot" className={styles.link}>
              {t('allProjects')} →
            </Link>
          </div>
        ) : p.status !== 'ready' ? (
          <p className={styles.muted} role="status">
            {t('loading')}
          </p>
        ) : p.script.scenes.length === 0 ? (
          <div className={styles.message}>
            <h1 className={styles.messageTitle}>{t('noScenesTitle')}</h1>
            <p className={styles.muted}>{t('noScenesBody')}</p>
            <Link href={`/app/${projectId}`} className={styles.link}>
              {t('openScript')} →
            </Link>
          </div>
        ) : tab === 'day' ? (
          <DayView p={p} projectId={projectId} onOpenScene={openScene} />
        ) : tab === 'shots' ? (
          <ShotsView p={p} projectId={projectId} focus={focusScene} onFocus={setFocusScene} />
        ) : tab === 'log' ? (
          <TakeLog p={p} />
        ) : tab === 'gear' ? (
          <GearView p={p} />
        ) : (
          <ReportView p={p} />
        )}
      </main>
    </div>
  );
}
