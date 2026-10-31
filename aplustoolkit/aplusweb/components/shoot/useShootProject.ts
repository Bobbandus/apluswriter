'use client';

import { useCallback, useEffect, useMemo } from 'react';
import type { Shotlist } from '@aplus/bridge/protocol';
import { parse } from '@aplus/fountain/parse';
import type { Script } from '@aplus/fountain/types';
import { paginate } from '@aplus/paginator/paginate';
import { readShotlists, resolveShotlists } from '@aplus/production/shotlist';
import { dayDate, readBoard, resolveBoard, type ResolvedBoard, type Stripboard } from '@aplus/production/stripboard';
import { readShoot, refreshShoot, sceneIndex, type SceneShoot, type ShootData } from '@aplus/shoot/set';
import { useProjectData, useProjectSource } from '@/lib/storage/hooks';
import type { ProjectMeta } from '@/lib/storage/types';

export interface ShootDay {
  id: string;
  /** 1-based, as the board numbers it. */
  number: number;
  date: string | null;
  note: string | undefined;
  /** Script indexes, in shooting order. Scenes gone from the script are left out. */
  scenes: number[];
}

export interface ShootProject {
  status: 'loading' | 'missing' | 'ready';
  meta: ProjectMeta | null;
  title: string;
  script: Script;
  eighths: readonly number[];
  board: Stripboard;
  resolved: ResolvedBoard;
  days: ShootDay[];
  /** Script index → its shotlist. */
  lists: Map<number, Shotlist>;
  shoot: ShootData;
  /** Script index → the set's record of it. */
  index: Map<number, SceneShoot>;
  /** SceneShoot key → script index. */
  keyToScene: Map<string, number>;
  /** The day chosen in the header, or null for every scene. */
  day: ShootDay | null;
  /** The scenes in play: the chosen day's, or all of them. */
  scenes: number[];
  update: (fn: (data: ShootData) => ShootData) => void;
}

/**
 * One script, read for the set: its scenes, shotlists and stripboard (read
 * only), and the set's own data, which is written. Every view of A+ Shoot,
 * the slate included, goes through here so they agree on what is current.
 */
export function useShootProject(projectId: string): ShootProject {
  const project = useProjectSource(projectId);
  const script = useMemo(() => parse(project.source), [project.source]);
  const pageSize = project.meta?.pageSize ?? 'a4';
  const eighths = useMemo(() => paginate(script, { pageSize }).sceneEighths, [script, pageSize]);

  const [storedLists, , listsReady] = useProjectData<unknown>(projectId, 'shotlists', []);
  const [storedBoard, , boardReady] = useProjectData<unknown>(projectId, 'stripboard', null);
  const [storedShoot, writeShoot, shootReady] = useProjectData<unknown>(projectId, 'shoot', null);

  const board = useMemo(() => readBoard(storedBoard), [storedBoard]);
  const resolved = useMemo(() => resolveBoard(script.scenes, board), [script, board]);
  const shoot = useMemo(() => readShoot(storedShoot), [storedShoot]);

  const lists = useMemo(() => {
    const all = readShotlists(storedLists);
    const found = resolveShotlists(script.scenes, all);
    const map = new Map<number, Shotlist>();
    all.forEach((list, i) => {
      const at = found[i];
      if (at !== null && at !== undefined) map.set(at, list);
    });
    return map;
  }, [storedLists, script]);

  const index = useMemo(() => sceneIndex(script.scenes, shoot), [script, shoot]);
  const keyToScene = useMemo(() => new Map([...index].map(([i, s]) => [s.key, i])), [index]);

  const days = useMemo<ShootDay[]>(
    () =>
      resolved.days.map(({ day, strips }, i) => ({
        id: day.id,
        number: i + 1,
        date: dayDate(board.startDate, i, board.skipWeekends),
        note: day.note,
        scenes: strips.map((s) => s.scene).filter((n): n is number => n !== null),
      })),
    [resolved, board],
  );

  const day = days.find((d) => d.id === shoot.current.day) ?? null;
  const scenes = useMemo(() => (day ? day.scenes : script.scenes.map((_, i) => i)), [day, script]);

  const ready = project.status === 'ready' && listsReady && boardReady && shootReady;

  const update = useCallback((fn: (data: ShootData) => ShootData) => writeShoot((previous: unknown) => fn(readShoot(previous))), [writeShoot]);

  // Keep the set's pointers in step with the script; bookkeeping, not an edit.
  useEffect(() => {
    if (!ready) return;
    const refreshed = refreshShoot(script.scenes, shoot);
    if (refreshed !== shoot) writeShoot(refreshed);
  }, [ready, script, shoot, writeShoot]);

  return {
    status: project.status === 'missing' ? 'missing' : ready ? 'ready' : 'loading',
    meta: project.meta,
    title: project.meta?.title ?? '',
    script,
    eighths,
    board,
    resolved,
    days,
    lists,
    shoot,
    index,
    keyToScene,
    day,
    scenes,
    update,
  };
}

/** A day picked by default on set: today's date on the board, if there is one. */
export function todaysDay(days: readonly ShootDay[], now = new Date()): ShootDay | null {
  const p = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  return days.find((d) => d.date === today) ?? null;
}

/** "Dag 2 · tis 4 nov" */
export function dayName(day: ShootDay, t: (key: string, values?: Record<string, string | number>) => string, locale: string): string {
  const label = t('dayNumber', { n: day.number });
  if (!day.date) return label;
  const date = new Date(`${day.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${label} · ${date}`;
}

