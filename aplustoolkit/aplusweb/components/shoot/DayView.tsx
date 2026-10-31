'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { castOf, eighthsLabel, summariseDay } from '@aplus/production/stripboard';
import { dayReport, sceneNumberOf, setDayLog } from '@aplus/shoot/set';
import { Progress, SceneChips } from './SceneChips';
import { dayName, type ShootProject } from './useShootProject';
import styles from './Shoot.module.css';

/**
 * The day: a callsheet to work from. Call and wrap, where, who, and every
 * scene in shooting order with how far it has got.
 */
export function DayView({ p, projectId, onOpenScene }: { p: ShootProject; projectId: string; onOpenScene: (index: number) => void }) {
  const t = useTranslations('shoot.set');
  const locale = useLocale();
  const dayKey = p.day?.id ?? 'all';
  const log = p.shoot.days[dayKey] ?? {};
  const scenes = p.script.scenes;

  const summary = useMemo(
    () => summariseDay(scenes, p.eighths, p.scenes.map((scene) => ({ ref: { index: scene, heading: '' }, scene }))),
    [scenes, p.eighths, p.scenes],
  );
  const report = useMemo(() => dayReport(p.scenes, p.lists, p.shoot, p.index), [p.scenes, p.lists, p.shoot, p.index]);

  const setLog = (patch: Parameters<typeof setDayLog>[2]) => p.update((d) => setDayLog(d, dayKey, patch));

  return (
    <div className={styles.narrow}>
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.heading}>{t('callsheet')}</p>
          <h1 className={styles.title}>{p.day ? dayName(p.day, t, locale) : t('allScenes')}</h1>
          {p.day?.note && <p className={styles.muted}>{p.day.note}</p>}
        </div>
        <button type="button" className={`${styles.button} ${styles.noPrint}`} onClick={() => window.print()}>
          {t('print')}
        </button>
      </div>

      {!p.day && (
        <p className={`${styles.card} ${styles.muted} ${styles.noPrint}`} style={{ marginBottom: 'var(--s-5)' }}>
          {p.days.length ? t('pickDay') : t('noDays')}{' '}
          <Link href={`/plan/stripboard/${projectId}`} className={styles.link}>
            {t('openStripboard')} →
          </Link>
        </p>
      )}

      <div className={styles.fields}>
        <label className={styles.field}>
          {t('call')}
          <input type="time" className={styles.input} value={log.call ?? ''} onChange={(e) => setLog({ call: e.target.value })} />
        </label>
        <label className={styles.field}>
          {t('wrap')}
          <input type="time" className={styles.input} value={log.wrap ?? ''} onChange={(e) => setLog({ wrap: e.target.value })} />
        </label>
      </div>
      <label className={styles.field} style={{ marginBottom: 'var(--s-5)' }}>
        {t('dayNote')}
        <textarea className={styles.textarea} value={log.note ?? ''} placeholder={t('dayNotePlaceholder')} onChange={(e) => setLog({ note: e.target.value })} />
      </label>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{summary.scenes}</span>
          <span className={styles.statLabel}>{t('scenes')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{eighthsLabel(summary.eighths)}</span>
          <span className={styles.statLabel}>{t('pages')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {report.done + report.skipped}/{report.shots}
          </span>
          <span className={styles.statLabel}>{t('shotsDone')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{summary.locations.length}</span>
          <span className={styles.statLabel}>{t('locations')}</span>
        </div>
      </div>

      {summary.nightThenDay && <p className={`${styles.card}`} style={{ marginBottom: 'var(--s-4)', borderColor: 'var(--flare)' }}>{t('nightThenDay')}</p>}

      <section className={styles.section}>
        <h2 className={styles.heading} style={{ marginBottom: 'var(--s-2)' }}>
          {t('locations')}
        </h2>
        <p>{summary.locations.join(' → ') || '—'}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading} style={{ marginBottom: 'var(--s-2)' }}>
          {t('cast')}
        </h2>
        <p>{summary.cast.join(', ') || '—'}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading} style={{ marginBottom: 'var(--s-3)' }}>
          {t('scenesInOrder')}
        </h2>
        <div className={styles.cards}>
          {p.scenes.map((index, i) => {
            const scene = scenes[index];
            if (!scene) return null;
            const r = report.scenes[i];
            return (
              <article key={index} className={`${styles.card} ${styles.sceneCard}`}>
                <span className={styles.sceneNumber}>{sceneNumberOf(scenes, index)}</span>
                <div className={styles.sceneBody}>
                  <span className={styles.sceneHeading}>{scene.heading}</span>
                  <SceneChips scene={scene} dayLabel={t('dayShort')} nightLabel={t('nightShort')} />
                  {scene.synopsis && <span className={styles.muted}>{scene.synopsis}</span>}
                  {castOf(scene).length > 0 && <span className={styles.faint}>{castOf(scene).join(', ')}</span>}
                  {r && r.shots > 0 && (
                    <>
                      <Progress done={r.done + r.skipped} total={r.shots} />
                      <span className={styles.faint}>{t('shotsProgress', { done: r.done + r.skipped, total: r.shots, takes: r.takes })}</span>
                    </>
                  )}
                </div>
                <div className={styles.sceneSide}>
                  <span className={styles.mono}>{eighthsLabel(p.eighths[index] ?? 0)}</span>
                  {r?.complete && (
                    <span className={styles.chip} data-tone="done">
                      {t('sceneDone')}
                    </span>
                  )}
                  <button type="button" className={`${styles.button} ${styles.noPrint}`} onClick={() => onOpenScene(index)}>
                    {t('toShots')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
