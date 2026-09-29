'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Shot, Shotlist } from '@aplus/bridge/protocol';
import type { Script } from '@aplus/fountain/types';
import { SHOT_SIZES, attachTo, isBlankShot, moveShot, newShot, renumber, resolveShotlists, shotSpecs } from '@aplus/production/shotlist';
import { castOf, eighthsLabel, stripColor } from '@aplus/production/stripboard';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { hasMod } from '@/lib/platform';
import colors from './stripColors.module.css';
import styles from './ShotlistView.module.css';

type Lists = readonly Shotlist[];

export interface ShotlistViewProps {
  script: Script;
  eighths: readonly number[];
  title: string;
  lists: Lists;
  set: (next: Lists | ((previous: Lists) => Lists), group?: string) => void;
  say: (message: string) => void;
}

type Field = 'number' | 'size' | 'description' | 'angle' | 'movement' | 'lens' | 'subjects' | 'notes' | 'camera' | 'follow' | 'path' | 'speed';
const GAME_FIELDS = ['camera', 'follow', 'path', 'speed'] as const;

const sceneLabel = (script: Script, index: number) => script.scenes[index]?.sceneNumber ?? String(index + 1);

/**
 * Shotlists, scene by scene.
 *
 * The scenes down the side, straight from the script, each showing how many
 * shots it has; the chosen scene's shots on the right, edited in place like
 * a spreadsheet row. Nothing to save — every change is stored as it is made,
 * and Ctrl+Z (outside a text field) takes it back.
 */
export function ShotlistView({ script, eighths, title, lists, set, say }: ShotlistViewProps) {
  const t = useTranslations('production');
  const locale = useLocale();
  const scenes = script.scenes;

  const found = useMemo(() => resolveShotlists(scenes, lists), [scenes, lists]);
  const listForScene = useMemo(() => {
    const map = new Map<number, number>();
    found.forEach((scene, list) => {
      if (scene !== null) map.set(scene, list);
    });
    return map;
  }, [found]);
  const detached = useMemo(() => found.flatMap((scene, list) => (scene === null ? [list] : [])), [found]);

  const [filter, setFilter] = useState<'all' | 'missing'>('all');
  const [selected, setSelected] = useState(0);
  const current = Math.min(selected, scenes.length - 1);
  const currentList = listForScene.get(current);
  const list = currentList === undefined ? null : (lists[currentList] ?? null);

  const visible = useMemo(
    () => scenes.map((_, i) => i).filter((i) => filter === 'all' || !(lists[listForScene.get(i) ?? -1]?.shots.length)),
    [scenes, filter, lists, listForScene],
  );

  const totalShots = lists.reduce((n, l, i) => (found[i] === null ? n : n + l.shots.length), 0);
  const covered = scenes.filter((_, i) => (lists[listForScene.get(i) ?? -1]?.shots.length ?? 0) > 0).length;

  /* ------------------------------------------------------------- focus */

  const main = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ shot: number; field: Field } | null>(null);
  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    pendingFocus.current = null;
    main.current?.querySelector<HTMLElement>(`[data-shot="${want.shot}"][data-field="${want.field}"]`)?.focus();
  });

  /* ----------------------------------------------------------- editing */

  const updateList = useCallback(
    (index: number, change: (list: Shotlist) => Shotlist, group?: string) =>
      set((previous) => previous.map((l, i) => (i === index ? change(l) : l)), group),
    [set],
  );

  const updateShots = (change: (shots: Shot[]) => Shot[], group?: string) => {
    if (currentList === undefined) return;
    updateList(currentList, (l) => ({ ...l, shots: change(l.shots) }), group);
  };

  const setField = (shotIndex: number, field: Field, value: string | number | string[] | undefined) =>
    updateShots(
      (shots) =>
        shots.map((shot, i) => {
          if (i !== shotIndex) return shot;
          const next: Record<string, unknown> = { ...shot };
          const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
          // Optional fields are left out when empty rather than stored blank,
          // so a cleared field and one never filled in are the same data.
          if (empty && field !== 'description' && field !== 'number' && field !== 'size') delete next[field];
          else next[field] = empty ? '' : value;
          return next as unknown as Shot;
        }),
      `${currentList}:${shotIndex}:${field}`,
    );

  const startList = () => {
    const fresh = attachTo({ scene: { index: current, heading: scenes[current]?.heading ?? '' }, shots: [newShot([])] }, scenes, current);
    pendingFocus.current = { shot: 0, field: 'description' };
    set((previous) => [...previous, fresh]);
  };

  const addShot = (after: number) => {
    if (!list) return;
    pendingFocus.current = { shot: after + 1, field: 'description' };
    updateShots((shots) => [...shots.slice(0, after + 1), newShot(shots), ...shots.slice(after + 1)]);
  };

  const duplicateShot = (index: number) => {
    if (!list) return;
    pendingFocus.current = { shot: index + 1, field: 'description' };
    updateShots((shots) => {
      const source = shots[index];
      if (!source) return shots;
      return [...shots.slice(0, index + 1), { ...source, number: newShot(shots).number }, ...shots.slice(index + 1)];
    });
  };

  const removeShot = (index: number) => {
    const shot = list?.shots[index];
    if (!shot) return;
    updateShots((shots) => shots.filter((_, i) => i !== index));
    // A shot added and never filled in goes quietly; anything else says so.
    if (!isBlankShot(shot)) say(t('shotRemoved', { number: shot.number }));
    const left = (list?.shots.length ?? 1) - 1;
    if (left > 0) pendingFocus.current = { shot: Math.min(index, left - 1), field: 'description' };
  };

  const move = (index: number, to: number, field: Field = 'description') => {
    if (!list || to < 0 || to >= list.shots.length) return;
    pendingFocus.current = { shot: to, field };
    updateShots((shots) => moveShot(shots, index, to));
  };

  const removeList = (index: number) => {
    set((previous) => previous.filter((_, i) => i !== index));
    say(t('listRemoved'));
  };

  const attach = (listIndex: number, scene: number) => {
    const heading = scenes[scene]?.heading ?? '';
    updateList(listIndex, (l) => attachTo(l, scenes, scene));
    setSelected(scene);
    say(t('attached', { heading }));
  };

  /** Alt+↑/↓ moves the shot, Ctrl+Enter adds one after it — from any of its fields. */
  const onRowKey = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const field = (event.target as HTMLElement).dataset['field'] as Field | undefined;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      move(index, index + (event.key === 'ArrowUp' ? -1 : 1), field);
    } else if (event.key === 'Enter' && hasMod(event.nativeEvent)) {
      event.preventDefault();
      addShot(index);
    }
  };

  /* -------------------------------------------------------- scene rail */

  const rail = useRef<HTMLUListElement>(null);
  const onRailKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const at = visible.indexOf(current);
    const next = visible[Math.max(0, Math.min(visible.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next === undefined) return;
    setSelected(next);
    rail.current?.querySelector<HTMLElement>(`[data-scene="${next}"]`)?.focus();
  };

  const scene = scenes[current];
  const cast = scene ? castOf(scene) : [];
  const anglesId = useId();
  const movesId = useId();
  const emptyScenes = scenes.map((_, i) => i).filter((i) => !listForScene.has(i));

  return (
    <div className={styles.layout}>
      <aside className={styles.rail} aria-label={t('scenes')}>
        <div className={styles.railHead}>
          <p className={styles.coverage}>
            {t('coverage', { done: covered, total: scenes.length })}
            <span className={styles.coverageShots}> · {t('shotCount', { count: totalShots })}</span>
          </p>
          <div className={styles.meter} aria-hidden="true">
            <span style={{ width: `${scenes.length ? (covered / scenes.length) * 100 : 0}%` }} />
          </div>
          <SegmentedControl
            size="sm"
            fullWidth
            label={t('scenes')}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('filterAll') },
              { value: 'missing', label: t('filterMissing') },
            ]}
          />
        </div>

        <select className={styles.sceneSelect} value={current} onChange={(e) => setSelected(Number(e.target.value))} aria-label={t('scenes')}>
          {scenes.map((s, i) => (
            <option key={s.id + i} value={i}>
              {sceneLabel(script, i)}. {s.heading}
            </option>
          ))}
        </select>

        <ul ref={rail} className={styles.sceneList} onKeyDown={onRailKey}>
          {visible.length === 0 && <li className={styles.railEmpty}>{t('allCovered')}</li>}
          {visible.map((i) => {
            const s = scenes[i];
            if (!s) return null;
            const count = lists[listForScene.get(i) ?? -1]?.shots.length ?? 0;
            return (
              <li key={s.id + i}>
                <button
                  type="button"
                  data-scene={i}
                  className={styles.sceneButton}
                  aria-current={i === current ? 'true' : undefined}
                  tabIndex={i === current ? 0 : -1}
                  onClick={() => setSelected(i)}
                >
                  <span className={`${styles.sceneNumber} ${colors.colored}`} data-color={stripColor(s)}>
                    {sceneLabel(script, i)}
                  </span>
                  <span className={styles.sceneHeading}>{s.heading}</span>
                  <span className={styles.sceneCount} data-empty={count === 0 || undefined}>
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {detached.length > 0 && (
          <section className={styles.detached}>
            <h2 className={styles.railLabel}>{t('detachedTitle')}</h2>
            <p className={styles.detachedHint}>{t('detachedHint')}</p>
            <ul className={styles.detachedList}>
              {detached.map((listIndex) => {
                const l = lists[listIndex];
                if (!l) return null;
                return (
                  <li key={listIndex} className={styles.detachedItem}>
                    <span className={styles.detachedHeading}>{l.scene.heading}</span>
                    <span className={styles.detachedCount}>{t('shotCount', { count: l.shots.length })}</span>
                    <span className={styles.detachedActions}>
                      <Menu
                        align="start"
                        trigger={(props) => (
                          <Button {...props} variant="ghost" size="sm" disabled={emptyScenes.length === 0}>
                            {t('attach')}
                          </Button>
                        )}
                        items={emptyScenes.map((i) => ({
                          label: `${sceneLabel(script, i)}. ${scenes[i]?.heading ?? ''}`,
                          onSelect: () => attach(listIndex, i),
                        }))}
                      />
                      <Button variant="ghost" size="sm" icon="trash" aria-label={t('removeList')} title={t('removeList')} onClick={() => removeList(listIndex)} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </aside>

      <main className={styles.main} ref={main}>
        {scene && (
          <header className={styles.sceneHead}>
            <p className={styles.eyebrow}>
              <span className={`${styles.dot} ${colors.colored}`} data-color={stripColor(scene)} aria-hidden="true" />
              {t('sceneNumber', { number: sceneLabel(script, current) })}
              <span className={styles.eyebrowMeta}> · {t('dayPages', { pages: eighthsLabel(eighths[current] ?? 0) })}</span>
            </p>
            <h1 className={styles.heading}>{scene.heading}</h1>
            {(cast.length > 0 || scene.synopsis) && (
              <p className={styles.sceneMeta}>
                {cast.length > 0 && <span className={styles.cast}>{cast.join(', ')}</span>}
                {scene.synopsis && <span className={styles.synopsis}>{scene.synopsis}</span>}
              </p>
            )}
          </header>
        )}

        {!list ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t('emptyTitle')}</p>
            <p className={styles.emptyBody}>{t('emptyBody')}</p>
            <Button variant="primary" icon="plus" onClick={startList}>
              {t('startList')}
            </Button>
          </div>
        ) : (
          <>
            <label className={styles.approach}>
              <span className={styles.fieldLabel}>{t('approach')}</span>
              <textarea
                className={styles.approachInput}
                rows={2}
                value={list.approach ?? ''}
                placeholder={t('approachPlaceholder')}
                onChange={(e) =>
                  updateList(
                    currentList as number,
                    (l) => {
                      const next = { ...l };
                      if (e.target.value) next.approach = e.target.value;
                      else delete next.approach;
                      return next;
                    },
                    `${currentList}:approach`,
                  )
                }
              />
            </label>

            <div className={styles.tableHead} aria-hidden="true">
              <span>{t('number')}</span>
              <span>{t('size')}</span>
              <span>{t('description')}</span>
              <span />
            </div>

            <ol className={styles.shots}>
              {list.shots.map((shot, index) => (
                <ShotRow
                  key={index}
                  shot={shot}
                  index={index}
                  last={index === list.shots.length - 1}
                  anglesId={anglesId}
                  movesId={movesId}
                  onField={(field, value) => setField(index, field, value)}
                  onKeyDown={(event) => onRowKey(event, index)}
                  onMove={(to) => move(index, to)}
                  onDuplicate={() => duplicateShot(index)}
                  onRemove={() => removeShot(index)}
                />
              ))}
            </ol>

            <div className={styles.footer}>
              <Button variant="secondary" icon="plus" onClick={() => addShot(list.shots.length - 1)}>
                {t('addShot')}
              </Button>
              {emptyScenes.length > 0 && (
                <Menu
                  align="start"
                  trigger={(props) => (
                    <Button {...props} variant="ghost" trailingIcon="chevronDown">
                      {t('moveList')}
                    </Button>
                  )}
                  items={emptyScenes.map((i) => ({
                    label: `${sceneLabel(script, i)}. ${scenes[i]?.heading ?? ''}`,
                    onSelect: () => {
                      attach(currentList as number, i);
                    },
                  }))}
                />
              )}
              <Menu
                trigger={(props) => <Button {...props} variant="ghost" icon="ellipsis" aria-label={t('listActions')} title={t('listActions')} />}
                items={[
                  { label: t('renumber'), onSelect: () => updateShots((shots) => renumber(shots)), disabled: list.shots.length === 0 },
                  'separator',
                  { label: t('removeList'), icon: 'trash', danger: true, onSelect: () => removeList(currentList as number) },
                ]}
              />
              <p className={styles.hint}>{t('keyboardShotlist')}</p>
            </div>
          </>
        )}

        <datalist id={anglesId}>
          {(t.raw('angleOptions') as string[]).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <datalist id={movesId}>
          {(t.raw('movementOptions') as string[]).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </main>

      <PrintedShotlists script={script} lists={lists} found={found} title={title} locale={locale} />
    </div>
  );
}

/* ========================================================================== */
/* One shot                                                                   */
/* ========================================================================== */

interface ShotRowProps {
  shot: Shot;
  index: number;
  last: boolean;
  anglesId: string;
  movesId: string;
  onField: (field: Field, value: string | number | string[] | undefined) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function ShotRow({ shot, index, last, anglesId, movesId, onField, onKeyDown, onMove, onDuplicate, onRemove }: ShotRowProps) {
  const t = useTranslations('production');
  const hasGame = GAME_FIELDS.some((f) => shot[f]);
  const [open, setOpen] = useState(hasGame || Boolean(shot.notes));
  const expanded = open || hasGame;
  const sizes = SHOT_SIZES.includes(shot.size as (typeof SHOT_SIZES)[number]) || !shot.size ? SHOT_SIZES : [shot.size, ...SHOT_SIZES];
  const ids = (field: Field) => ({ 'data-shot': index, 'data-field': field });

  return (
    <li className={styles.shot} onKeyDown={onKeyDown}>
      <div className={styles.shotMain}>
        <input
          {...ids('number')}
          className={`${styles.cell} ${styles.number}`}
          value={shot.number}
          aria-label={t('number')}
          onChange={(e) => onField('number', e.target.value)}
        />
        <select {...ids('size')} className={`${styles.cell} ${styles.size}`} value={shot.size} aria-label={t('size')} onChange={(e) => onField('size', e.target.value)}>
          {!shot.size && <option value="">—</option>}
          {sizes.map((size) => (
            <option key={size} value={size}>
              {size}
              {SHOT_SIZES.includes(size as (typeof SHOT_SIZES)[number]) ? ` · ${t(`sizes.${size}`)}` : ''}
            </option>
          ))}
        </select>
        <textarea
          {...ids('description')}
          className={`${styles.cell} ${styles.description}`}
          rows={1}
          value={shot.description}
          placeholder={t('descriptionPlaceholder')}
          aria-label={t('description')}
          onChange={(e) => onField('description', e.target.value)}
        />
        <Menu
          trigger={(props) => <Button {...props} variant="ghost" size="sm" icon="ellipsis" aria-label={t('shotActions', { number: shot.number })} />}
          items={[
            { label: t('moveUp'), icon: 'chevronUp', onSelect: () => onMove(index - 1), disabled: index === 0 },
            { label: t('moveDown'), icon: 'chevronDown', onSelect: () => onMove(index + 1), disabled: last },
            { label: t('duplicateShot'), icon: 'copy', onSelect: onDuplicate },
            { label: expanded ? t('fewerFields') : t('moreFields'), onSelect: () => setOpen(!expanded), disabled: hasGame },
            'separator',
            { label: t('removeShot'), icon: 'trash', danger: true, onSelect: onRemove },
          ]}
        />
      </div>

      <div className={styles.shotSpecs}>
        <label className={styles.spec}>
          <span className={styles.specLabel}>{t('angle')}</span>
          <input {...ids('angle')} className={styles.cell} list={anglesId} value={shot.angle ?? ''} onChange={(e) => onField('angle', e.target.value)} />
        </label>
        <label className={styles.spec}>
          <span className={styles.specLabel}>{t('movement')}</span>
          <input {...ids('movement')} className={styles.cell} list={movesId} value={shot.movement ?? ''} onChange={(e) => onField('movement', e.target.value)} />
        </label>
        <label className={`${styles.spec} ${styles.lensSpec}`}>
          <span className={styles.specLabel}>{t('lens')}</span>
          <span className={styles.lens}>
            <input
              {...ids('lens')}
              className={styles.cell}
              inputMode="numeric"
              value={shot.lens ?? ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
                onField('lens', digits ? Number(digits) : undefined);
              }}
            />
            <span className={styles.unit}>{t('lensUnit')}</span>
          </span>
        </label>
        <label className={styles.spec}>
          <span className={styles.specLabel}>{t('subjects')}</span>
          <ListInput {...ids('subjects')} value={shot.subjects ?? []} placeholder={t('subjectsPlaceholder')} onCommit={(v) => onField('subjects', v)} />
        </label>
      </div>

      {expanded && (
        <div className={styles.shotMore}>
          <label className={`${styles.spec} ${styles.wide}`}>
            <span className={styles.specLabel}>{t('notes')}</span>
            <input {...ids('notes')} className={styles.cell} value={shot.notes ?? ''} placeholder={t('notesPlaceholder')} onChange={(e) => onField('notes', e.target.value)} />
          </label>
          {GAME_FIELDS.map((field) => (
            <label key={field} className={styles.spec}>
              <span className={styles.specLabel}>{t(field)}</span>
              <input {...ids(field)} className={styles.cell} value={shot[field] ?? ''} onChange={(e) => onField(field, e.target.value)} />
            </label>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * A comma-separated list, edited as text. Kept as the typed text while the
 * field has focus — parsing on every keystroke would eat the comma the writer
 * just typed — and committed as a list when they leave it.
 */
function ListInput({
  value,
  onCommit,
  placeholder,
  ...rest
}: { value: readonly string[]; onCommit: (next: string[]) => void; placeholder: string } & Record<`data-${string}`, string | number>) {
  const joined = value.join(', ');
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setDraft(null);
    if (next.join(', ') !== joined) onCommit(next);
  };
  return (
    <input
      {...rest}
      className={styles.cell}
      value={draft ?? joined}
      placeholder={placeholder}
      onFocus={() => setDraft(joined)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.altKey && !hasMod(e.nativeEvent)) {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

/* ========================================================================== */
/* Print                                                                      */
/* ========================================================================== */

/** Every scene's shots, for paper: only drawn by the printer. */
function PrintedShotlists({ script, lists, found, title, locale }: { script: Script; lists: Lists; found: (number | null)[]; title: string; locale: string }) {
  const t = useTranslations('production');
  const order = lists
    .map((list, i) => ({ list, scene: found[i] ?? null }))
    .filter((x): x is { list: Shotlist; scene: number } => x.scene !== null && x.list.shots.length > 0)
    .sort((a, b) => a.scene - b.scene);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date());

  return (
    <section className={styles.print} aria-hidden="true">
      <h1 className={styles.printTitle}>{t('printShotlistTitle')}</h1>
      <p className={styles.printMeta}>{t('printedFrom', { title, date })}</p>
      {order.map(({ list, scene }) => (
        <div key={scene} className={styles.printScene}>
          <h2 className={styles.printHeading}>
            {sceneLabel(script, scene)}. {script.scenes[scene]?.heading}
          </h2>
          {list.approach && <p className={styles.printApproach}>{list.approach}</p>}
          <table className={styles.printTable}>
            <thead>
              <tr>
                <th>{t('number')}</th>
                <th>{t('size')}</th>
                <th>{t('description')}</th>
                <th>{t('lens')} · {t('angle')} · {t('movement')}</th>
                <th>{t('subjects')}</th>
                <th>{t('notes')}</th>
              </tr>
            </thead>
            <tbody>
              {list.shots.map((shot, i) => (
                <tr key={i}>
                  <td>{shot.number}</td>
                  <td>{shot.size}</td>
                  <td>{shot.description}</td>
                  <td>{shotSpecs(shot)}</td>
                  <td>{(shot.subjects ?? []).join(', ')}</td>
                  <td>{shot.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
