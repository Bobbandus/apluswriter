import type { SceneIndexEntry } from './types';

/**
 * Story days and energy, read off the scenes.
 *
 * A scene states its day with `[[day: 3]]`; the scenes after it are on that
 * day until another says otherwise, which is how a script actually works: most
 * scenes never mention the day. Energy is per scene and is never inherited,
 * since a scene with no rating has no rating.
 */

export interface TimelineRow {
  index: number;
  heading: string;
  /** What the scene itself says, or null. */
  day: number | null;
  /** The day it takes place on: its own, otherwise the last one stated before it. */
  effectiveDay: number | null;
  energy: number | null;
}

export interface TimelineWarning {
  /** Index of the scene whose day is earlier than the one before it. */
  index: number;
  day: number;
  after: number;
}

export interface Timeline {
  rows: TimelineRow[];
  /** One entry per story day, in order, with the scenes on it. */
  days: { day: number; scenes: number[] }[];
  /** Times the story goes backwards: a flashback, or a mistake worth a second look. */
  warnings: TimelineWarning[];
}

export function timeline(scenes: readonly Pick<SceneIndexEntry, 'heading' | 'meta'>[]): Timeline {
  const rows: TimelineRow[] = [];
  const warnings: TimelineWarning[] = [];
  let current: number | null = null;

  scenes.forEach((scene, index) => {
    const day = scene.meta.day ?? null;
    if (day !== null) {
      if (current !== null && day < current) warnings.push({ index, day, after: current });
      current = day;
    }
    rows.push({ index, heading: scene.heading, day, effectiveDay: current, energy: scene.meta.energy ?? null });
  });

  const byDay = new Map<number, number[]>();
  for (const row of rows) {
    if (row.effectiveDay === null) continue;
    byDay.set(row.effectiveDay, [...(byDay.get(row.effectiveDay) ?? []), row.index]);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, list]) => ({ day, scenes: list }));

  return { rows, days, warnings };
}

/**
 * Points for the energy curve, as fractions: x from 0 to 1 along the scenes, y from 0 (calm)
 * to 1 (intense). Scenes without a rating are left out rather than drawn as zero, and the
 * curve is one line per unbroken run of rated scenes.
 */
export function energyPaths(rows: readonly Pick<TimelineRow, 'energy'>[]): { x: number; y: number }[][] {
  const paths: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  const last = Math.max(1, rows.length - 1);

  rows.forEach((row, i) => {
    if (row.energy === null) {
      if (run.length > 0) paths.push(run);
      run = [];
      return;
    }
    run.push({ x: i / last, y: (row.energy - 1) / 9 });
  });
  if (run.length > 0) paths.push(run);
  return paths;
}
