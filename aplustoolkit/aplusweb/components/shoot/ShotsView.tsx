'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Shot } from '@aplus/bridge/protocol';
import { shotSpecs } from '@aplus/production/shotlist';
import { castOf, eighthsLabel } from '@aplus/production/stripboard';
import {
  addTake,
  blockingTips,
  ensureScene,
  nextTake,
  sceneNumberOf,
  setBlocking,
  setCurrent,
  setShotState,
  shootingOrder,
  shotState,
  slateScene,
  takesOf,
  updateTake,
  type ShootData,
  type ShotState,
  type Take,
} from '@aplus/shoot/set';
import { ContinuityPhotos } from './ContinuityPhotos';
import { Progress, SceneChips } from './SceneChips';
import type { ShootProject } from './useShootProject';
import styles from './Shoot.module.css';

const NEXT_RATING: Record<string, Take['rating']> = { none: 'good', good: 'ng', ng: null };

/**
 * The shotlist on set: the day's scenes down the side, the chosen scene's
 * shots with what is in the can, its takes, how to block it, and continuity
 * photos.
 */
export function ShotsView({ p, projectId, focus, onFocus }: { p: ShootProject; projectId: string; focus: number | null; onFocus: (index: number) => void }) {
  const t = useTranslations('shoot.set');
  const scenes = p.script.scenes;
  const currentIndex = p.shoot.current.scene ? p.keyToScene.get(p.shoot.current.scene) : undefined;
  const selected = focus !== null && scenes[focus] ? focus : currentIndex !== undefined && p.scenes.includes(currentIndex) ? currentIndex : (p.scenes[0] ?? 0);
  const scene = scenes[selected];
  const record = p.index.get(selected);
  const shots = useMemo(() => p.lists.get(selected)?.shots ?? [], [p.lists, selected]);
  const number = sceneNumberOf(scenes, selected);

  /** Every change to a scene goes through here, so the scene gets its record on first touch. */
  const withScene = (fn: (data: ShootData, key: string) => ShootData) =>
    p.update((d) => {
      const { data, key } = ensureScene(d, scenes, selected);
      return fn(data, key);
    });

  /** The scene's key now, making the record if it has none, for things that need it at once (a photo's file name). */
  const ensureKey = () => {
    const { key } = ensureScene(p.shoot, scenes, selected);
    p.update((d) => ensureScene(d, scenes, selected, key).data);
    return key;
  };

  const onSlate = (shot: string | null) => withScene((d, key) => setCurrent(d, { scene: key, shot }));
  const setState = (shot: string, state: ShotState) => withScene((d, key) => setShotState(d, key, shot, state));
  const logTake = (shot: string | null) =>
    withScene((d, key) =>
      addTake(d, {
        scene: key,
        slate: slateScene(number, shot),
        shot,
        take: nextTake(d, key, shot),
        tc: '',
        at: Date.now(),
        roll: '',
        rating: null,
        soundIssue: false,
        note: '',
        continuity: '',
      }),
    );
  const cycleRating = (take: Take) => p.update((d) => updateTake(d, take.id, { rating: NEXT_RATING[take.rating ?? 'none'] ?? null }));

  const order = useMemo(() => shootingOrder(shots), [shots]);
  const reordered = order.some((s, i) => s !== shots[i]);
  const tips = scene ? blockingTips(scene, shots) : [];

  if (!scene) return null;

  const isCurrent = (shot: string | null) => record !== undefined && p.shoot.current.scene === record.key && p.shoot.current.shot === shot;
  const sceneTakes = record ? p.shoot.takes.filter((tk) => tk.scene === record.key) : [];

  return (
    <div className={styles.split}>
      <nav className={styles.sceneList} aria-label={t('scenes')}>
        {p.scenes.map((index) => {
          const s = scenes[index];
          if (!s) return null;
          const list = p.lists.get(index)?.shots ?? [];
          const rec = p.index.get(index);
          const finished = list.filter((shot) => shotState(rec, shot.number) !== 'todo').length;
          return (
            <button key={index} type="button" className={styles.sceneItem} aria-current={index === selected} onClick={() => onFocus(index)}>
              <span className={styles.sceneItemTitle}>
                {sceneNumberOf(scenes, index)} · {s.heading}
              </span>
              {list.length > 0 ? (
                <>
                  <Progress done={finished} total={list.length} />
                  <span className={styles.faint}>{t('shotsCount', { done: finished, total: list.length })}</span>
                </>
              ) : (
                <span className={styles.faint}>{t('noShotlistShort')}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div>
        <div className={styles.section}>
          <p className={styles.heading}>
            {t('scene')} {number} · {eighthsLabel(p.eighths[selected] ?? 0)}
          </p>
          <h1 className={styles.title}>{scene.heading}</h1>
          <div className={styles.row} style={{ marginTop: 'var(--s-2)' }}>
            <SceneChips scene={scene} dayLabel={t('dayShort')} nightLabel={t('nightShort')} />
            {castOf(scene).length > 0 && <span className={styles.muted}>{castOf(scene).join(', ')}</span>}
          </div>
          {scene.synopsis && <p className={styles.muted} style={{ marginTop: 'var(--s-2)' }}>{scene.synopsis}</p>}
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.heading}>{t('shots')}</h2>
            <div className={styles.row}>
              <button type="button" className={styles.button} aria-pressed={isCurrent(null)} onClick={() => onSlate(null)}>
                {isCurrent(null) ? t('onSlate') : t('slateSceneOnly')}
              </button>
            </div>
          </div>

          {shots.length === 0 ? (
            <p className={`${styles.card} ${styles.muted}`}>
              {t('noShotlist')}{' '}
              <Link href={`/plan/shotlist/${projectId}`} className={styles.link}>
                {t('openShotlist')} →
              </Link>
            </p>
          ) : (
            <div className={styles.cards}>
              {shots.map((shot) => (
                <ShotCard
                  key={shot.number}
                  shot={shot}
                  label={slateScene(number, shot.number)}
                  state={shotState(record, shot.number)}
                  current={isCurrent(shot.number)}
                  takes={record ? takesOf(p.shoot, record.key, shot.number) : []}
                  onState={(state) => setState(shot.number, state)}
                  onSlate={() => onSlate(shot.number)}
                  onTake={() => logTake(shot.number)}
                  onRate={cycleRating}
                />
              ))}
            </div>
          )}
          {sceneTakes.some((tk) => tk.shot === null) && (
            <p className={styles.faint} style={{ marginTop: 'var(--s-2)' }}>
              {t('sceneOnlyTakes', { n: sceneTakes.filter((tk) => tk.shot === null).length })}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading} style={{ marginBottom: 'var(--s-3)' }}>
            {t('blocking')}
          </h2>
          <div className={styles.card}>
            {shots.length > 1 && (
              <p style={{ marginBottom: 'var(--s-3)' }}>
                <strong>{t('order')}:</strong> {order.map((s) => slateScene(number, s.number)).join(' → ')}
                {!reordered && <span className={styles.faint}> ({t('orderSame')})</span>}
              </p>
            )}
            {tips.length > 0 && (
              <ul className={styles.tips}>
                {tips.map((tip) => (
                  <li key={tip}>{t(`tips.${tip}`)}</li>
                ))}
              </ul>
            )}
            <label className={styles.field}>
              {t('blockingNotes')}
              <textarea
                className={styles.textarea}
                value={record?.blocking ?? ''}
                placeholder={t('blockingPlaceholder')}
                onChange={(e) => withScene((d, key) => setBlocking(d, key, e.target.value))}
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading} style={{ marginBottom: 'var(--s-3)' }}>
            {t('continuity')}
          </h2>
          <ContinuityPhotos projectId={projectId} sceneKey={record?.key ?? null} ensureKey={ensureKey} />
        </section>
      </div>
    </div>
  );
}

function ShotCard({
  shot,
  label,
  state,
  current,
  takes,
  onState,
  onSlate,
  onTake,
  onRate,
}: {
  shot: Shot;
  label: string;
  state: ShotState;
  current: boolean;
  takes: Take[];
  onState: (state: ShotState) => void;
  onSlate: () => void;
  onTake: () => void;
  onRate: (take: Take) => void;
}) {
  const t = useTranslations('shoot.set');
  const specs = shotSpecs(shot);
  return (
    <article className={styles.shot} data-state={state} data-current={current}>
      <span className={styles.shotBadge}>{label}</span>
      <div className={styles.shotBody}>
        <div className={styles.row}>
          <strong>
            {t('shotNumber', { n: shot.number })} · {shot.size}
          </strong>
          {specs && <span className={styles.muted}>{specs}</span>}
        </div>
        {shot.description && <span>{shot.description}</span>}
        {shot.subjects?.length ? <span className={styles.faint}>{shot.subjects.join(', ')}</span> : null}
        {shot.notes && <span className={styles.faint}>{shot.notes}</span>}
        {takes.length > 0 && (
          <div className={styles.takes} aria-label={t('takes')}>
            {takes.map((take) => (
              <button
                key={take.id}
                type="button"
                className={styles.chip}
                data-tone={take.rating ?? undefined}
                onClick={() => onRate(take)}
                title={t('rateHint')}
                style={{ height: 32, minWidth: 40, border: 0, cursor: 'pointer' }}
              >
                T{take.take}
                {take.rating === 'good' ? ' ✓' : take.rating === 'ng' ? ' ✕' : ''}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={styles.shotActions}>
        <div className={styles.choice} role="group" aria-label={t('status')}>
          {(['todo', 'done', 'skip'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={state === s} data-tone={s === 'done' ? 'good' : undefined} onClick={() => onState(s)}>
              {t(`state.${s}`)}
            </button>
          ))}
        </div>
        <span className={styles.grow} />
        <button type="button" className={styles.ghost} onClick={onTake}>
          + {t('take')}
        </button>
        <button type="button" className={`${styles.button} ${current ? styles.primary : ''}`} aria-pressed={current} onClick={onSlate}>
          {current ? t('onSlate') : t('putOnSlate')}
        </button>
      </div>
    </article>
  );
}
