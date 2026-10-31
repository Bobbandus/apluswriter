'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { removeTake, takesCsv, updateTake, type Take } from '@aplus/shoot/set';
import { saveFile } from '@/lib/platform/files';
import type { ShootProject } from './useShootProject';
import styles from './Shoot.module.css';

type Filter = 'day' | 'today' | 'all';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Every take, newest first: good or NG, sound, a note and continuity, the way
 * a script supervisor keeps them. The slate writes a take on every clap; this
 * is where it gets its verdict.
 */
export function TakeLog({ p }: { p: ShootProject }) {
  const t = useTranslations('shoot.set');
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>(p.day ? 'day' : 'today');

  const dayKeys = useMemo(() => new Set(p.scenes.map((i) => p.index.get(i)?.key).filter((k): k is string => Boolean(k))), [p.scenes, p.index]);
  const takes = useMemo(() => {
    const since = startOfToday();
    return p.shoot.takes
      .filter((take) => (filter === 'all' ? true : filter === 'today' ? take.at >= since : take.scene !== null && dayKeys.has(take.scene)))
      .sort((a, b) => b.at - a.at);
  }, [p.shoot.takes, filter, dayKeys]);

  const set = (take: Take, patch: Partial<Take>) => p.update((d) => updateTake(d, take.id, patch));
  const remove = (take: Take) => {
    if (window.confirm(t('deleteTake', { slate: take.slate, take: take.take }))) p.update((d) => removeTake(d, take.id));
  };

  const exportCsv = () => {
    const name = `${p.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Manus'} – ${t('tab.log')}.csv`;
    void saveFile(name, new Blob([takesCsv(takes)], { type: 'text/csv;charset=utf-8' }));
  };

  const good = takes.filter((take) => take.rating === 'good').length;

  return (
    <div className={styles.narrow}>
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.heading}>{t('tab.log')}</p>
          <h1 className={styles.title}>{t('takesSummary', { n: takes.length, good })}</h1>
        </div>
        <div className={styles.row}>
          <div className={styles.choice} role="group" aria-label={t('filter')}>
            {(['day', 'today', 'all'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} disabled={f === 'day' && !p.day}>
                {t(`filters.${f}`)}
              </button>
            ))}
          </div>
          <button type="button" className={styles.button} onClick={exportCsv} disabled={!takes.length}>
            {t('exportCsv')}
          </button>
        </div>
      </div>

      {takes.length === 0 ? (
        <p className={`${styles.card} ${styles.muted}`}>{t('noTakes')}</p>
      ) : (
        <div className={styles.cards}>
          {takes.map((take) => (
            <article key={take.id} className={styles.take} data-rating={take.rating ?? undefined}>
              <div>
                <div className={styles.takeSlate}>
                  {take.slate || '—'} / {take.take}
                </div>
                <div className={styles.mono}>{take.tc || t('noTc')}</div>
                <div className={styles.faint}>
                  {new Date(take.at).toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                  {take.roll ? ` · ${take.roll}` : ''}
                </div>
              </div>
              <div className={styles.shotBody}>
                <div className={styles.row}>
                  <div className={styles.choice} role="group" aria-label={t('rating')}>
                    <button type="button" data-tone="good" aria-pressed={take.rating === 'good'} onClick={() => set(take, { rating: take.rating === 'good' ? null : 'good' })}>
                      {t('good')}
                    </button>
                    <button type="button" data-tone="ng" aria-pressed={take.rating === 'ng'} onClick={() => set(take, { rating: take.rating === 'ng' ? null : 'ng' })}>
                      NG
                    </button>
                  </div>
                  <div className={styles.choice}>
                    <button type="button" data-tone="ng" aria-pressed={take.soundIssue} onClick={() => set(take, { soundIssue: !take.soundIssue })}>
                      {t('soundIssue')}
                    </button>
                  </div>
                  <span className={styles.grow} />
                  <button type="button" className={styles.ghost} onClick={() => remove(take)} aria-label={t('delete')}>
                    ✕
                  </button>
                </div>
                <div className={styles.takeFields}>
                  <input className={styles.input} value={take.note} placeholder={t('takeNote')} onChange={(e) => set(take, { note: e.target.value })} />
                  <input className={styles.input} value={take.continuity} placeholder={t('takeContinuity')} onChange={(e) => set(take, { continuity: e.target.value })} />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
