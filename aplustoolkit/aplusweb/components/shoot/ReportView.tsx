'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { dayReport, sceneNumberOf, setDayLog, slateScene } from '@aplus/shoot/set';
import { Progress } from './SceneChips';
import { dayName, type ShootProject } from './useShootProject';
import styles from './Shoot.module.css';

/** Midnight at the start of a board date, local time: the day's takes are the ones clapped from then on. */
const startOf = (date: string | null) => (date ? new Date(`${date}T00:00:00`).getTime() : 0);

/**
 * The wrap report: what got done, what is left, how many takes, and a few
 * lines for whoever was not there. Copy it into a message or print it.
 */
export function ReportView({ p }: { p: ShootProject }) {
  const t = useTranslations('shoot.set');
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const dayKey = p.day?.id ?? 'all';
  const log = p.shoot.days[dayKey] ?? {};
  const scenes = p.script.scenes;
  const report = useMemo(() => dayReport(p.scenes, p.lists, p.shoot, p.index, startOf(p.day?.date ?? null)), [p.scenes, p.lists, p.shoot, p.index, p.day]);

  const remaining = report.scenes.filter((r) => !r.complete);
  const heading = p.day ? dayName(p.day, t, locale) : t('allScenes');

  const status = (r: (typeof report.scenes)[number]) => (r.complete ? t('statusDone') : r.started ? t('statusStarted') : r.shots === 0 ? t('statusNoShots') : t('statusNotStarted'));

  const text = () => {
    const lines = [
      `${p.title} — ${heading}`,
      [log.call && `${t('call')} ${log.call}`, log.wrap && `${t('wrap')} ${log.wrap}`].filter(Boolean).join(' · '),
      '',
      t('reportLine', { complete: report.complete, scenes: report.scenes.length, done: report.done + report.skipped, shots: report.shots, takes: report.takes, good: report.good }),
      '',
      ...report.scenes.map((r) => {
        const num = sceneNumberOf(scenes, r.index);
        const left = r.remaining.length ? ` — ${t('left')}: ${r.remaining.map((s) => slateScene(num, s)).join(', ')}` : '';
        return `${num} ${scenes[r.index]?.heading ?? ''}: ${status(r)}${left}`;
      }),
    ];
    if (log.report?.trim()) lines.push('', log.report.trim());
    return lines.filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard (not HTTPS, or refused): printing still works.
    }
  };

  return (
    <div className={styles.narrow}>
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.heading}>{t('tab.report')}</p>
          <h1 className={styles.title}>{heading}</h1>
        </div>
        <div className={`${styles.row} ${styles.noPrint}`}>
          <button type="button" className={styles.button} onClick={() => void copy()}>
            {copied ? t('copied') : t('copyReport')}
          </button>
          <button type="button" className={styles.button} onClick={() => window.print()}>
            {t('print')}
          </button>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {report.complete}/{report.scenes.length}
          </span>
          <span className={styles.statLabel}>{t('scenesDone')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {report.done + report.skipped}/{report.shots}
          </span>
          <span className={styles.statLabel}>{t('shotsDone')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{report.takes}</span>
          <span className={styles.statLabel}>{p.day?.date ? t('takesThatDay') : t('takesAll')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{report.good}</span>
          <span className={styles.statLabel}>{t('goodTakes')}</span>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.heading} style={{ marginBottom: 'var(--s-3)' }}>
          {t('perScene')}
        </h2>
        <div className={styles.cards}>
          {report.scenes.map((r) => {
            const num = sceneNumberOf(scenes, r.index);
            return (
              <div key={r.index} className={styles.card}>
                <div className={styles.row} style={{ marginBottom: 'var(--s-2)' }}>
                  <strong className={styles.grow}>
                    {num} · {scenes[r.index]?.heading}
                  </strong>
                  <span className={styles.chip} data-tone={r.complete ? 'done' : undefined}>
                    {status(r)}
                  </span>
                </div>
                {r.shots > 0 && <Progress done={r.done + r.skipped} total={r.shots} />}
                <p className={styles.faint} style={{ marginTop: 'var(--s-2)' }}>
                  {t('sceneLine', { done: r.done, skipped: r.skipped, shots: r.shots, takes: r.takes, good: r.good })}
                  {r.remaining.length > 0 && ` · ${t('left')}: ${r.remaining.map((s) => slateScene(num, s)).join(', ')}`}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {remaining.length > 0 && p.day && (
        <p className={`${styles.card} ${styles.muted}`} style={{ marginBottom: 'var(--s-5)' }}>
          {t('carryOver', { n: remaining.length })}
        </p>
      )}

      <label className={styles.field}>
        {t('reportNotes')}
        <textarea className={styles.textarea} style={{ minHeight: 160 }} value={log.report ?? ''} placeholder={t('reportPlaceholder')} onChange={(e) => p.update((d) => setDayLog(d, dayKey, { report: e.target.value }))} />
      </label>
    </div>
  );
}
