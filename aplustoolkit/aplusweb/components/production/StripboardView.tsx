'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { SceneIndexEntry, Script } from '@aplus/fountain/types';
import {
  DEFAULT_TARGET_EIGHTHS,
  addDay,
  castNumbers,
  castOf,
  dayDate,
  draftSchedule,
  eighthsLabel,
  lightOf,
  moveDay,
  moveStrip,
  refOf,
  removeDay,
  removeMissing,
  resolveBoard,
  schedule,
  setDayNote,
  settingOf,
  stripColor,
  summariseDay,
  unschedule,
  type Slot,
  type StripColor,
  type Stripboard,
} from '@aplus/production/stripboard';
import { Button } from '@/components/ui/Button';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import colors from './stripColors.module.css';
import styles from './StripboardView.module.css';

export interface StripboardViewProps {
  script: Script;
  eighths: readonly number[];
  title: string;
  board: Stripboard;
  set: (next: Stripboard | ((previous: Stripboard) => Stripboard), group?: string) => void;
  say: (message: string) => void;
}

/** What is being dragged: a strip already on a day, or an unscheduled scene. */
type Drag = { from: Slot } | { scene: number };
/** Where it would land. */
type Target = { day: number; strip: number } | 'unscheduled';

const COLORS: StripColor[] = ['intDay', 'extDay', 'intNight', 'extNight'];

/**
 * The stripboard: every scene as a coloured strip, laid out on shooting days.
 *
 * Unscheduled scenes on the left, days on the right, strips dragged between
 * them — or, without a mouse, moved with Alt+↑/↓ and the Move to … menu. Each
 * day adds itself up (pages, scenes, locations, cast) and says plainly when
 * something will hurt on the day: over the target, a company move, or night
 * work followed by day work.
 */
export function StripboardView({ script, eighths, title, board, set, say }: StripboardViewProps) {
  const t = useTranslations('production');
  const locale = useLocale();
  const scenes = script.scenes;

  const resolved = useMemo(() => resolveBoard(scenes, board), [scenes, board]);
  const numbers = useMemo(() => castNumbers(script), [script]);
  const summaries = useMemo(() => resolved.days.map((d) => summariseDay(scenes, eighths, d.strips)), [resolved, scenes, eighths]);
  const target = board.targetEighths ?? DEFAULT_TARGET_EIGHTHS;

  const totalEighths = eighths.reduce((a, b) => a + b, 0);
  const scheduledEighths = summaries.reduce((a, s) => a + s.eighths, 0);
  const unscheduledEighths = resolved.unscheduled.reduce((a, i) => a + (eighths[i] ?? 0), 0);
  const missing = summaries.reduce((a, s) => a + s.missing, 0);

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }), [locale]);
  const dateOf = (index: number) => {
    const iso = dayDate(board.startDate, index, board.skipWeekends);
    return iso ? dateFormat.format(new Date(`${iso}T00:00:00Z`)) : null;
  };

  /* ------------------------------------------------------------- focus */

  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  useEffect(() => {
    const scene = pendingFocus.current;
    if (scene === null) return;
    pendingFocus.current = null;
    root.current?.querySelector<HTMLElement>(`[data-strip-scene="${scene}"]`)?.focus();
  });

  /* ----------------------------------------------------------- actions */

  const toDay = (from: Drag, to: Slot) => {
    if ('from' in from) set((b) => moveStrip(b, from.from, to));
    else set((b) => schedule(b, refOf(scenes, from.scene), to));
  };

  const toUnscheduled = (from: Drag) => {
    if ('from' in from) set((b) => unschedule(b, from.from));
  };

  const toNewDay = (from: Drag) => {
    set((b) => {
      const withDay = addDay(b);
      const day = withDay.days.length - 1;
      return 'from' in from ? moveStrip(withDay, from.from, { day, strip: 0 }) : schedule(withDay, refOf(scenes, from.scene), { day, strip: 0 });
    });
  };

  const draft = () => {
    const before = board.days.length;
    const next = draftSchedule(scenes, eighths, board);
    set(next);
    say(t('drafted', { count: next.days.length - before }));
  };

  const removeDayAt = (index: number) => {
    set((b) => removeDay(b, index));
    say(t('dayRemoved', { n: index + 1 }));
  };

  /** Alt+↑/↓: within the day, and over the edge into the next or previous day. */
  const onStripKey = (event: KeyboardEvent<HTMLElement>, slot: Slot, scene: number | null) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const up = event.key === 'ArrowUp';
    const length = board.days[slot.day]?.strips.length ?? 0;
    let to: Slot | null = null;
    if (up && slot.strip > 0) to = { day: slot.day, strip: slot.strip - 1 };
    else if (!up && slot.strip < length - 1) to = { day: slot.day, strip: slot.strip + 2 };
    else if (up && slot.day > 0) to = { day: slot.day - 1, strip: board.days[slot.day - 1]?.strips.length ?? 0 };
    else if (!up && slot.day < board.days.length - 1) to = { day: slot.day + 1, strip: 0 };
    if (!to) return;
    if (scene !== null) pendingFocus.current = scene;
    set((b) => moveStrip(b, slot, to));
  };

  const moveMenu = (from: Drag, currentDay: number | null): (MenuItem | 'separator')[] => [
    ...board.days.flatMap((_, i) =>
      i === currentDay
        ? []
        : [{ label: [t('day', { n: i + 1 }), dateOf(i)].filter(Boolean).join(' · '), onSelect: () => toDay(from, { day: i, strip: board.days[i]?.strips.length ?? 0 }) }],
    ),
    { label: t('toNewDay'), icon: 'plus', onSelect: () => toNewDay(from) },
    ...(currentDay !== null ? (['separator', { label: t('toUnscheduled'), onSelect: () => toUnscheduled(from) }] as const) : []),
  ];

  /* ------------------------------------------------------ drag and drop */

  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Target | null>(null);

  const start = (event: DragEvent, what: Drag) => {
    event.dataTransfer.effectAllowed = 'move';
    // Firefox will not start a drag without data.
    event.dataTransfer.setData('text/plain', 'strip');
    setDrag(what);
  };

  const end = () => {
    setDrag(null);
    setOver(null);
  };

  const overStrip = (event: DragEvent<HTMLElement>, day: number, strip: number) => {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const at = event.clientY > rect.top + rect.height / 2 ? strip + 1 : strip;
    if (!over || over === 'unscheduled' || over.day !== day || over.strip !== at) setOver({ day, strip: at });
  };

  const overDay = (event: DragEvent<HTMLElement>, day: number) => {
    if (!drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const at = board.days[day]?.strips.length ?? 0;
    if (!over || over === 'unscheduled' || over.day !== day || over.strip !== at) setOver({ day, strip: at });
  };

  const overUnscheduled = (event: DragEvent<HTMLElement>) => {
    if (!drag || !('from' in drag)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (over !== 'unscheduled') setOver('unscheduled');
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    if (drag && over) {
      const scene = 'from' in drag ? resolved.days[drag.from.day]?.strips[drag.from.strip]?.scene : drag.scene;
      if (scene !== null && scene !== undefined) pendingFocus.current = scene;
      if (over === 'unscheduled') toUnscheduled(drag);
      else toDay(drag, over);
    }
    end();
  };

  const indicator = (day: number, strip: number) =>
    over !== null && over !== 'unscheduled' && over.day === day && over.strip === strip ? <li key="indicator" className={styles.indicator} aria-hidden="true" /> : null;

  /* ------------------------------------------------------------ render */

  const strip = (index: number, props: StripProps['handlers'], menu: (MenuItem | 'separator')[], dragging: boolean) => {
    const scene = scenes[index] as SceneIndexEntry;
    return (
      <Strip
        scene={scene}
        index={index}
        number={scene.sceneNumber ?? String(index + 1)}
        eighths={eighths[index] ?? 0}
        cast={castOf(scene)
          .map((name) => ({ name, n: numbers.get(name) ?? 0 }))
          .sort((a, b) => a.n - b.n)}
        menu={menu}
        dragging={dragging}
        handlers={props}
      />
    );
  };

  return (
    <div className={styles.layout} ref={root}>
      <header className={styles.toolbar}>
        <div className={styles.overview}>
          <p className={styles.summary}>
            {t('summary', { days: board.days.length, scheduled: eighthsLabel(scheduledEighths), total: eighthsLabel(totalEighths) })}
          </p>
          <div className={styles.progress} aria-hidden="true">
            <span style={{ width: `${totalEighths ? (scheduledEighths / totalEighths) * 100 : 0}%` }} />
          </div>
          <ul className={styles.legend}>
            {COLORS.map((c) => (
              <li key={c}>
                <span className={`${styles.swatch} ${colors.colored}`} data-color={c} aria-hidden="true" />
                {t(`legend.${c}`)}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.settings}>
          <label className={styles.setting}>
            <span className={styles.settingLabel}>{t('startDate')}</span>
            <input
              type="date"
              className={styles.input}
              value={board.startDate ?? ''}
              onChange={(e) => set((b) => ({ ...b, startDate: e.target.value || null }), 'startDate')}
            />
          </label>
          <label className={styles.setting}>
            <span className={styles.settingLabel}>{t('target')}</span>
            <span className={styles.targetField}>
              <input
                type="number"
                className={`${styles.input} ${styles.targetInput}`}
                min={0.5}
                max={20}
                step={0.5}
                value={target / 8}
                onChange={(e) => {
                  const pages = Number(e.target.value);
                  if (Number.isFinite(pages) && pages >= 0.125) set((b) => ({ ...b, targetEighths: Math.round(pages * 8) }), 'target');
                }}
              />
              <span className={styles.unit}>{t('targetUnit')}</span>
            </span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={board.skipWeekends ?? false} onChange={(e) => set((b) => ({ ...b, skipWeekends: e.target.checked }))} />
            {t('skipWeekends')}
          </label>
        </div>

        <div className={styles.buttons}>
          <Button variant={resolved.unscheduled.length > 0 ? 'primary' : 'secondary'} icon="sparkle" disabled={resolved.unscheduled.length === 0} onClick={draft} title={t('draftHint')}>
            {t('draft')}
          </Button>
          <Button variant="secondary" icon="plus" onClick={() => set((b) => addDay(b))}>
            {t('addDay')}
          </Button>
        </div>
      </header>

      <header className={styles.printHead}>
        <h1>{t('printStripboardTitle')}</h1>
        <p>{t('printedFrom', { title, date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date()) })}</p>
      </header>

      {missing > 0 && (
        <div className={styles.warning} role="status">
          <span>{t('missingStrips', { count: missing })}</span>
          <Button variant="subtle" size="sm" onClick={() => set((b) => removeMissing(scenes, b))}>
            {t('removeMissing')}
          </Button>
        </div>
      )}

      <div className={styles.board}>
        <aside className={styles.unscheduled} data-over={over === 'unscheduled' || undefined} onDragOver={overUnscheduled} onDrop={drop} aria-label={t('unscheduled')}>
          <h2 className={styles.columnHead}>
            {t('unscheduled')}
            <span className={styles.columnMeta}>
              {resolved.unscheduled.length} · {t('dayPages', { pages: eighthsLabel(unscheduledEighths) })}
            </span>
          </h2>
          {resolved.unscheduled.length === 0 ? (
            <p className={styles.columnEmpty}>{t('unscheduledEmpty')}</p>
          ) : (
            <ul className={styles.strips}>
              {resolved.unscheduled.map((index) => (
                <li key={`u${index}`}>
                  {strip(
                    index,
                    { onDragStart: (e) => start(e, { scene: index }), onDragEnd: end },
                    moveMenu({ scene: index }, null),
                    drag !== null && 'scene' in drag && drag.scene === index,
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className={styles.days}>
          {resolved.days.map(({ day, strips }, dayIndex) => {
            const summary = summaries[dayIndex];
            if (!summary) return null;
            const date = dateOf(dayIndex);
            const moves = Math.max(0, summary.locations.length - 1);
            const over_ = summary.eighths > target;
            return (
              <section key={day.id} className={styles.day} aria-label={t('day', { n: dayIndex + 1 })}>
                <header className={styles.dayHead}>
                  <div className={styles.dayTitle}>
                    <h2 className={styles.dayName}>{t('day', { n: dayIndex + 1 })}</h2>
                    {date && <span className={styles.dayDate}>{date}</span>}
                  </div>
                  <div className={styles.dayStats}>
                    <span className={styles.dayPages} data-over={over_ || undefined}>
                      {t('dayPages', { pages: eighthsLabel(summary.eighths) })}
                    </span>
                    <span>{t('dayScenes', { count: summary.scenes })}</span>
                  </div>
                  <div className={styles.badges}>
                    {over_ && <span className={styles.badge} data-tone="warn">{t('overTarget')}</span>}
                    {summary.nightThenDay && (
                      <span className={styles.badge} data-tone="warn" title={t('nightThenDayHint')}>
                        {t('nightThenDay')}
                      </span>
                    )}
                    {moves > 0 && (
                      <span className={styles.badge} title={t('movesHint')}>
                        {t('moves', { count: moves })}
                      </span>
                    )}
                  </div>
                  <Menu
                    trigger={(props) => <Button {...props} variant="ghost" size="sm" icon="ellipsis" aria-label={t('dayActions', { n: dayIndex + 1 })} className={styles.dayMenu} />}
                    items={[
                      { label: t('moveDayEarlier'), icon: 'chevronUp', disabled: dayIndex === 0, onSelect: () => set((b) => moveDay(b, dayIndex, dayIndex - 1)) },
                      { label: t('moveDayLater'), icon: 'chevronDown', disabled: dayIndex === board.days.length - 1, onSelect: () => set((b) => moveDay(b, dayIndex, dayIndex + 1)) },
                      'separator',
                      { label: t('removeDay'), icon: 'trash', danger: true, onSelect: () => removeDayAt(dayIndex) },
                    ]}
                  />
                  <div className={styles.load} aria-hidden="true">
                    <span data-over={over_ || undefined} style={{ width: `${Math.min(100, (summary.eighths / target) * 100)}%` }} />
                  </div>
                </header>

                <input
                  className={styles.note}
                  value={day.note ?? ''}
                  placeholder={t('dayNotePlaceholder')}
                  aria-label={t('dayNote')}
                  onChange={(e) => set((b) => setDayNote(b, dayIndex, e.target.value), `note:${day.id}`)}
                />

                <ul className={styles.strips} data-empty={strips.length === 0 || undefined} onDragOver={(e) => overDay(e, dayIndex)} onDrop={drop}>
                  {strips.map(({ ref, scene }, stripIndex) => {
                    const slot = { day: dayIndex, strip: stripIndex };
                    return [
                      indicator(dayIndex, stripIndex),
                      <li key={`${day.id}:${stripIndex}:${ref.heading}`} onDragOver={(e) => overStrip(e, dayIndex, stripIndex)}>
                        {scene === null ? (
                          <MissingStrip
                            heading={ref.heading}
                            onRemove={() => set((b) => unschedule(b, slot))}
                            onKeyDown={(e) => onStripKey(e, slot, null)}
                          />
                        ) : (
                          strip(
                            scene,
                            {
                              onDragStart: (e) => start(e, { from: slot }),
                              onDragEnd: end,
                              onKeyDown: (e) => onStripKey(e, slot, scene),
                            },
                            moveMenu({ from: slot }, dayIndex),
                            drag !== null && 'from' in drag && drag.from.day === dayIndex && drag.from.strip === stripIndex,
                          )
                        )}
                      </li>,
                    ];
                  })}
                  {indicator(dayIndex, strips.length)}
                  {strips.length === 0 && <li className={styles.dayEmpty}>{t('dayEmpty')}</li>}
                </ul>
              </section>
            );
          })}

          <button type="button" className={styles.newDay} onClick={() => set((b) => addDay(b))}>
            + {t('addDay')}
          </button>
        </div>
      </div>

      <footer className={styles.foot}>
        {numbers.size > 0 && (
          <details className={styles.castLegend}>
            <summary>{t('castLegend')}</summary>
            <ol>
              {[...numbers.entries()].map(([name, n]) => (
                <li key={name}>
                  <span className={styles.castNumber}>{n}</span> {name}
                </li>
              ))}
            </ol>
          </details>
        )}
        <p className={styles.hint}>{t('keyboardStripboard')}</p>
        {numbers.size > 0 && (
          <p className={styles.printCast}>
            <strong>{t('castLegend')}:</strong> {[...numbers.entries()].map(([name, n]) => `${n} ${name}`).join(' · ')}
          </p>
        )}
      </footer>
    </div>
  );
}

/* ========================================================================== */
/* One strip                                                                  */
/* ========================================================================== */

interface StripProps {
  scene: SceneIndexEntry;
  index: number;
  number: string;
  eighths: number;
  cast: { name: string; n: number }[];
  menu: (MenuItem | 'separator')[];
  dragging: boolean;
  handlers: {
    onDragStart: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  };
}

function Strip({ scene, index, number, eighths, cast, menu, dragging, handlers }: StripProps) {
  const t = useTranslations('production');
  const light = lightOf(scene);
  const setting = settingOf(scene);
  const castNames = cast.map((c) => `${c.n}. ${c.name}`).join('\n');

  return (
    <div
      className={`${styles.strip} ${colors.colored}`}
      data-color={stripColor(scene)}
      data-dragging={dragging || undefined}
      data-strip-scene={index}
      draggable
      tabIndex={0}
      onDragStart={handlers.onDragStart}
      onDragEnd={handlers.onDragEnd}
      onKeyDown={handlers.onKeyDown}
    >
      <span className={styles.grip} aria-hidden="true">
        ⋮⋮
      </span>
      <span className={styles.stripNumber}>{number}</span>
      <span className={styles.setting}>{setting ?? '—'}</span>
      <span className={styles.where}>
        <span className={styles.location}>{scene.location || scene.heading}</span>
        {scene.synopsis && <span className={styles.stripSynopsis}>{scene.synopsis}</span>}
      </span>
      <span className={styles.light}>{light ? t(`light.${light}`) : ''}</span>
      <span className={styles.stripPages}>{eighthsLabel(eighths)}</span>
      <span className={styles.stripCast} title={castNames}>
        {cast.map((c) => c.n).join(', ')}
      </span>
      <Menu
        trigger={(props) => <Button {...props} variant="ghost" size="sm" icon="ellipsis" aria-label={t('stripActions', { number })} title={t('moveTo')} className={styles.stripMenu} />}
        items={menu}
      />
    </div>
  );
}

function MissingStrip({ heading, onRemove, onKeyDown }: { heading: string; onRemove: () => void; onKeyDown: (event: KeyboardEvent<HTMLElement>) => void }) {
  const t = useTranslations('production');
  return (
    <div className={styles.missing} tabIndex={0} onKeyDown={onKeyDown}>
      <span className={styles.missingHeading}>{heading}</span>
      <span className={styles.missingNote}>{t('missingStrip')}</span>
      <Button variant="ghost" size="sm" icon="trash" aria-label={t('removeMissing')} title={t('removeMissing')} onClick={onRemove} />
    </div>
  );
}
