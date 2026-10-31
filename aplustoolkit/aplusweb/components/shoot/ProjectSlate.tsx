'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  addTake,
  ensureScene,
  nextOpenShot,
  nextTake,
  sceneNumberOf,
  setCurrent,
  shotState,
  slateScene,
  takesOf,
  updateTake,
  type ShootData,
} from '@aplus/shoot/set';
import { Slate } from './Slate';
import { useShootProject } from './useShootProject';
import panel from './SlatePanel.module.css';
import shoot from './Shoot.module.css';
import styles from './ProjectSlate.module.css';

/**
 * The slate run from a script. Scene and shot come from the shotlist (the day's
 * scenes first), the take counts itself from the takes already logged, and every
 * clap lands in the project's take log with its timecode.
 */
export function ProjectSlate({ projectId }: { projectId: string }) {
  const t = useTranslations('shoot.set');
  const p = useShootProject(projectId);
  const scenes = p.script.scenes;

  const fromKey = p.shoot.current.scene ? p.keyToScene.get(p.shoot.current.scene) : undefined;
  const sceneIndex = fromKey ?? p.scenes[0] ?? 0;
  const record = p.index.get(sceneIndex);
  const shots = useMemo(() => p.lists.get(sceneIndex)?.shots ?? [], [p.lists, sceneIndex]);
  // A shot that is no longer in the list is not on the slate.
  const shotNo = p.shoot.current.shot && shots.some((s) => s.number === p.shoot.current.shot) ? p.shoot.current.shot : fromKey === undefined ? (shots[0]?.number ?? null) : null;
  const shot = shots.find((s) => s.number === shotNo);
  const number = sceneNumberOf(scenes, sceneIndex);
  const take = record ? nextTake(p.shoot, record.key, shotNo) : 1;
  const takes = record ? takesOf(p.shoot, record.key, shotNo) : [];
  const last = takes[takes.length - 1];

  if (p.status === 'missing') {
    return (
      <div className={styles.message}>
        <p>{t('missingTitle')}</p>
        <Link href="/shoot">{t('allProjects')} →</Link>
      </div>
    );
  }
  if (p.status !== 'ready') return <div className={styles.message}>{t('loading')}</div>;

  /** Put a scene (and shot) on the slate, giving the scene a record if it has none. */
  const pick = (index: number, shotNumber: string | null) =>
    p.update((d) => {
      const { data, key } = ensureScene(d, scenes, index);
      return setCurrent(data, { scene: key, shot: shotNumber });
    });

  const onClap = ({ tc, at, roll, note }: { tc: string; at: number; roll: string; note: string }) =>
    p.update((d: ShootData) => {
      const { data, key } = ensureScene(d, scenes, sceneIndex);
      const withCurrent = setCurrent(data, { scene: key, shot: shotNo });
      return addTake(withCurrent, {
        scene: key,
        slate: slateScene(number, shotNo),
        shot: shotNo,
        take: nextTake(withCurrent, key, shotNo),
        tc,
        at,
        roll,
        rating: null,
        soundIssue: false,
        note,
        continuity: '',
      });
    });

  const nextShot = nextOpenShot(shots, record, shotNo);
  const sceneAt = p.scenes.indexOf(sceneIndex);

  const linkedPanel = (
    <section className={panel.section}>
      <h2 className={panel.heading}>{t('fromScript')}</h2>
      <label className={panel.field}>
        <span>{t('scene')}</span>
        <select value={sceneIndex} onChange={(e) => pick(Number(e.target.value), p.lists.get(Number(e.target.value))?.shots[0]?.number ?? null)}>
          {(p.scenes.includes(sceneIndex) ? p.scenes : [sceneIndex, ...p.scenes]).map((i) => (
            <option key={i} value={i}>
              {sceneNumberOf(scenes, i)} · {scenes[i]?.heading}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.shots} role="listbox" aria-label={t('shots')}>
        <button type="button" role="option" aria-selected={shotNo === null} className={styles.shot} onClick={() => pick(sceneIndex, null)}>
          <strong>{number}</strong>
          <span>{t('sceneOnly')}</span>
        </button>
        {shots.map((s) => {
          const state = shotState(record, s.number);
          return (
            <button key={s.number} type="button" role="option" aria-selected={shotNo === s.number} className={styles.shot} data-state={state} onClick={() => pick(sceneIndex, s.number)}>
              <strong>{slateScene(number, s.number)}</strong>
              <span>
                {s.size} {s.description}
              </span>
              {state !== 'todo' && <em>{t(`state.${state}`)}</em>}
            </button>
          );
        })}
      </div>

      <div className={styles.buttons}>
        <button type="button" className={panel.small} disabled={sceneAt <= 0} onClick={() => pick(p.scenes[sceneAt - 1] as number, p.lists.get(p.scenes[sceneAt - 1] as number)?.shots[0]?.number ?? null)}>
          ‹ {t('prevScene')}
        </button>
        <button type="button" className={panel.small} disabled={!nextShot} onClick={() => nextShot && pick(sceneIndex, nextShot)}>
          {t('nextShot')} ›
        </button>
        <button type="button" className={panel.small} disabled={sceneAt < 0 || sceneAt >= p.scenes.length - 1} onClick={() => pick(p.scenes[sceneAt + 1] as number, p.lists.get(p.scenes[sceneAt + 1] as number)?.shots[0]?.number ?? null)}>
          {t('nextScene')} ›
        </button>
      </div>

      {last && (
        <div className={styles.last}>
          <span>
            {t('lastTake', { take: last.take })} <span className={shoot.mono}>{last.tc}</span>
          </span>
          <div className={shoot.choice}>
            <button type="button" data-tone="good" aria-pressed={last.rating === 'good'} onClick={() => p.update((d) => updateTake(d, last.id, { rating: last.rating === 'good' ? null : 'good' }))}>
              {t('good')}
            </button>
            <button type="button" data-tone="ng" aria-pressed={last.rating === 'ng'} onClick={() => p.update((d) => updateTake(d, last.id, { rating: last.rating === 'ng' ? null : 'ng' }))}>
              NG
            </button>
          </div>
        </div>
      )}
      <p className={styles.note}>{p.day ? t('slateDay', { n: p.day.number }) : t('slateAll')}</p>
    </section>
  );

  const hint = shot ? `${shot.size}${shot.lens ? ` · ${shot.lens} mm` : ''}${shot.description ? ` · ${shot.description}` : ''}` : scenes[sceneIndex]?.heading;

  return (
    <Slate
      link={{
        scene: slateScene(number, shotNo),
        take,
        prod: p.title,
        onClap,
        panel: linkedPanel,
        ...(hint ? { hint } : {}),
        back: `/shoot/${projectId}`,
        backLabel: p.title || 'A+ Shoot',
      }}
    />
  );
}
