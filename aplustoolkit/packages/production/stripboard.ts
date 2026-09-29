import type { SceneIndexEntry, Script } from '../fountain/types';
import { NIGHT } from './analysis';

/**
 * The stripboard: every scene as a strip, arranged into shooting days.
 *
 * What is stored is only the *arrangement* — which scenes go on which day, in
 * which order. Everything a strip shows (heading, length, cast, day or night)
 * is read from the script every time, so a board can never disagree with the
 * script about what a scene is. A scene the board has not placed is simply
 * unscheduled; there is no list of them to fall out of step.
 *
 * Scenes are pointed at the way the rest of the app points at them: by the
 * `[[id:]]` when the writer has one, otherwise by heading and position, taking
 * the nearest scene with that heading. A strip whose scene has gone from the
 * script is kept and shown as missing, never silently dropped: a producer who
 * planned a day around it needs to see that it went.
 *
 * Everything here is pure. The page holds the board in project data and hands
 * each change through these functions.
 */

/* ========================================================================== */
/* Shapes                                                                     */
/* ========================================================================== */

/** A scene on the board. */
export interface StripRef {
  /** Position in the script when the strip was last in step with it. */
  index: number;
  heading: string;
  /** The scene's `[[id:]]`, when it has a real one. Outranks heading and position. */
  sceneId?: string;
}

export interface ShootDay {
  /** Stable, so a day keeps its identity (and React its key) when days move. */
  id: string;
  strips: StripRef[];
  /** A line for the day: "Hela teamet", "Drönare bokad" … */
  note?: string;
}

export interface Stripboard {
  version: 1;
  days: ShootDay[];
  /** The first shooting day, `YYYY-MM-DD`. Later days follow it. */
  startDate?: string | null;
  /** Leave Saturdays and Sundays out when dating days. */
  skipWeekends?: boolean;
  /** How much a day should hold, in eighths of a page. */
  targetEighths?: number;
}

/** Four pages a day: a normal, unhurried pace for a small crew. */
export const DEFAULT_TARGET_EIGHTHS = 32;

export const emptyBoard = (): Stripboard => ({ version: 1, days: [], startDate: null, skipWeekends: true, targetEighths: DEFAULT_TARGET_EIGHTHS });

/* ========================================================================== */
/* Reading stored data                                                        */
/* ========================================================================== */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readRef(value: unknown): StripRef | null {
  if (!isRecord(value)) return null;
  const { index, heading, sceneId } = value;
  if (typeof index !== 'number' || !Number.isFinite(index) || typeof heading !== 'string') return null;
  const ref: StripRef = { index: Math.max(0, Math.floor(index)), heading };
  if (typeof sceneId === 'string' && sceneId) ref.sceneId = sceneId;
  return ref;
}

/**
 * A board from whatever was stored, never throwing. Data written by an older
 * or newer build, or by hand, must open as *something*: a board that fails to
 * load is a schedule the producer cannot see at all.
 */
export function readBoard(value: unknown): Stripboard {
  const board = emptyBoard();
  if (!isRecord(value)) return board;

  if (Array.isArray(value['days'])) {
    const seen = new Set<string>();
    for (const raw of value['days']) {
      if (!isRecord(raw)) continue;
      let id = typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : newDayId();
      if (seen.has(id)) id = newDayId();
      seen.add(id);
      const strips = Array.isArray(raw['strips']) ? raw['strips'].map(readRef).filter((r): r is StripRef => r !== null) : [];
      const day: ShootDay = { id, strips };
      if (typeof raw['note'] === 'string' && raw['note']) day.note = raw['note'];
      board.days.push(day);
    }
  }

  const start = value['startDate'];
  board.startDate = typeof start === 'string' && ISO_DATE.test(start) ? start : null;
  if (typeof value['skipWeekends'] === 'boolean') board.skipWeekends = value['skipWeekends'];
  const target = value['targetEighths'];
  if (typeof target === 'number' && Number.isFinite(target) && target >= 1) board.targetEighths = Math.round(target);
  return board;
}

let dayCounter = 0;

/** A short id for a new day. Random plus a counter, so two made in one tick differ. */
export function newDayId(): string {
  dayCounter += 1;
  return `d_${Math.random().toString(36).slice(2, 8)}${dayCounter.toString(36)}`;
}

/* ========================================================================== */
/* Pointing at scenes                                                         */
/* ========================================================================== */

const normalise = (heading: string) => heading.replace(/\s+/g, ' ').trim().toUpperCase();

/** Scenes without an `[[id:]]` get a positional stand-in (`#3`) that is no identity at all. */
const realId = (scene: SceneIndexEntry): string | undefined => (scene.id && !scene.id.startsWith('#') ? scene.id : undefined);

/** How the board should point at a scene today. */
export function refOf(scenes: readonly SceneIndexEntry[], index: number): StripRef {
  const scene = scenes[index];
  if (!scene) throw new RangeError(`No scene ${index}`);
  const ref: StripRef = { index, heading: scene.heading };
  const id = realId(scene);
  if (id) ref.sceneId = id;
  return ref;
}

/**
 * Finds the scene each ref points at, never giving one scene to two refs.
 *
 * Ids first, because they are exact. Then headings, each ref taking the
 * nearest scene with its heading that nothing has claimed — so two scenes
 * both called INT. KÖK - DAG stay two strips, and neither swallows the other.
 *
 * @returns for each ref, in order, the index of its scene or null.
 */
export function resolveRefs(scenes: readonly SceneIndexEntry[], refs: readonly StripRef[]): (number | null)[] {
  const result: (number | null)[] = refs.map(() => null);
  const claimed = new Set<number>();

  const byId = new Map<string, number>();
  scenes.forEach((scene, index) => {
    const id = realId(scene);
    if (id && !byId.has(id)) byId.set(id, index);
  });

  refs.forEach((ref, i) => {
    if (!ref.sceneId) return;
    const index = byId.get(ref.sceneId);
    if (index === undefined || claimed.has(index)) return;
    result[i] = index;
    claimed.add(index);
  });

  const byHeading = new Map<string, number[]>();
  scenes.forEach((scene, index) => {
    const key = normalise(scene.heading);
    const list = byHeading.get(key) ?? [];
    list.push(index);
    byHeading.set(key, list);
  });

  // Nearest first across all refs, not ref by ref: otherwise an early ref can
  // take the scene a later ref sits right on top of.
  const candidates: { ref: number; scene: number; distance: number }[] = [];
  refs.forEach((ref, i) => {
    if (result[i] !== null) return;
    for (const index of byHeading.get(normalise(ref.heading)) ?? []) {
      candidates.push({ ref: i, scene: index, distance: Math.abs(index - ref.index) });
    }
  });
  candidates.sort((a, b) => a.distance - b.distance || a.ref - b.ref);
  for (const c of candidates) {
    if (result[c.ref] !== null || claimed.has(c.scene)) continue;
    result[c.ref] = c.scene;
    claimed.add(c.scene);
  }

  return result;
}

export interface ResolvedStrip {
  ref: StripRef;
  /** The scene's index in the script today, or null if it is gone. */
  scene: number | null;
}

export interface ResolvedDay {
  day: ShootDay;
  strips: ResolvedStrip[];
}

export interface ResolvedBoard {
  days: ResolvedDay[];
  /** Scenes on no day, in script order. */
  unscheduled: number[];
}

export function resolveBoard(scenes: readonly SceneIndexEntry[], board: Stripboard): ResolvedBoard {
  const refs = board.days.flatMap((day) => day.strips);
  const found = resolveRefs(scenes, refs);
  let cursor = 0;
  const days = board.days.map((day) => ({
    day,
    strips: day.strips.map((ref) => ({ ref, scene: found[cursor++] ?? null })),
  }));
  const placed = new Set(found.filter((n): n is number => n !== null));
  const unscheduled = scenes.map((_, index) => index).filter((index) => !placed.has(index));
  return { days, unscheduled };
}

/**
 * The same board with every ref brought up to date with the script, so small
 * drift (a scene added above, a heading's spacing) never accumulates into a
 * lost strip. Missing strips are left exactly as they were.
 */
export function refreshRefs(scenes: readonly SceneIndexEntry[], board: Stripboard): Stripboard {
  const resolved = resolveBoard(scenes, board);
  let changed = false;
  const days = resolved.days.map(({ day, strips }) => ({
    ...day,
    strips: strips.map(({ ref, scene }) => {
      if (scene === null) return ref;
      const next = refOf(scenes, scene);
      if (next.index !== ref.index || next.heading !== ref.heading || next.sceneId !== ref.sceneId) changed = true;
      return next;
    }),
  }));
  return changed ? { ...board, days } : board;
}

/* ========================================================================== */
/* Changing the board                                                         */
/* ========================================================================== */

/** Where a strip sits: day and position within the day. */
export interface Slot {
  day: number;
  strip: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function withoutStrip(board: Stripboard, from: Slot): { board: Stripboard; ref: StripRef | null } {
  const day = board.days[from.day];
  const ref = day?.strips[from.strip];
  if (!day || !ref) return { board, ref: null };
  const days = board.days.map((d, i) => (i === from.day ? { ...d, strips: d.strips.filter((_, j) => j !== from.strip) } : d));
  return { board: { ...board, days }, ref };
}

function withStrip(board: Stripboard, ref: StripRef, to: Slot): Stripboard {
  const day = board.days[to.day];
  if (!day) return board;
  const at = clamp(to.strip, 0, day.strips.length);
  const strips = [...day.strips.slice(0, at), ref, ...day.strips.slice(at)];
  return { ...board, days: board.days.map((d, i) => (i === to.day ? { ...d, strips } : d)) };
}

/**
 * Moves a strip to another place on the board. `to.strip` is the position in
 * the target day *as it looks before the move*, which is what a drop target
 * under the pointer knows.
 */
export function moveStrip(board: Stripboard, from: Slot, to: Slot): Stripboard {
  const taken = withoutStrip(board, from);
  if (!taken.ref) return board;
  const target = from.day === to.day && to.strip > from.strip ? { ...to, strip: to.strip - 1 } : to;
  if (target.day === from.day && target.strip === from.strip) return board;
  return withStrip(taken.board, taken.ref, target);
}

/** Takes a strip off its day. The scene goes back to unscheduled. */
export function unschedule(board: Stripboard, from: Slot): Stripboard {
  return withoutStrip(board, from).board;
}

/** Puts an unscheduled scene on a day. */
export function schedule(board: Stripboard, ref: StripRef, to: Slot): Stripboard {
  return withStrip(board, ref, to);
}

export function addDay(board: Stripboard, at = board.days.length, id = newDayId()): Stripboard {
  const days = [...board.days];
  days.splice(clamp(at, 0, days.length), 0, { id, strips: [] });
  return { ...board, days };
}

/** Removes a day. Its scenes are not lost; they are unscheduled again. */
export function removeDay(board: Stripboard, index: number): Stripboard {
  if (!board.days[index]) return board;
  return { ...board, days: board.days.filter((_, i) => i !== index) };
}

export function moveDay(board: Stripboard, from: number, to: number): Stripboard {
  if (!board.days[from]) return board;
  const target = clamp(to, 0, board.days.length - 1);
  if (target === from) return board;
  const days = [...board.days];
  const [day] = days.splice(from, 1);
  days.splice(target, 0, day as ShootDay);
  return { ...board, days };
}

export function setDayNote(board: Stripboard, index: number, note: string): Stripboard {
  if (!board.days[index]) return board;
  return {
    ...board,
    days: board.days.map((d, i) => {
      if (i !== index) return d;
      const next: ShootDay = { id: d.id, strips: d.strips };
      if (note.trim()) next.note = note;
      return next;
    }),
  };
}

/** Drops every strip whose scene has left the script. */
export function removeMissing(scenes: readonly SceneIndexEntry[], board: Stripboard): Stripboard {
  const resolved = resolveBoard(scenes, board);
  return {
    ...board,
    days: resolved.days.map(({ day, strips }) => ({ ...day, strips: strips.filter((s) => s.scene !== null).map((s) => s.ref) })),
  };
}

/* ========================================================================== */
/* What a strip is                                                            */
/* ========================================================================== */

export type Setting = 'INT' | 'EXT' | 'INT/EXT';
export type Light = 'day' | 'night';

const DAY = new Set([
  'DAG', 'DAY', 'MORGON', 'MORNING', 'FÖRMIDDAG', 'EFTERMIDDAG', 'AFTERNOON', 'MIDDAG', 'NOON',
  'GRYNING', 'DAWN', 'SOLUPPGÅNG', 'SUNRISE', 'DAGTID', 'DAYTIME', 'LUNCH',
]);

/** INT, EXT or both, from the heading's prefix. */
export function settingOf(scene: Pick<SceneIndexEntry, 'prefix' | 'heading'>): Setting | null {
  const prefix = (scene.prefix ?? scene.heading.split(/[\s.]/)[0] ?? '').toUpperCase().replace(/\s+/g, '');
  if (/^(INT\.?\/EXT|EXT\.?\/INT|I\/E|E\/I)/.test(prefix)) return 'INT/EXT';
  if (/^(INT|INNE)/.test(prefix)) return 'INT';
  if (/^(EXT|UTE|EST)/.test(prefix)) return 'EXT';
  return null;
}

/**
 * Day or night, from the time of day. Null for the words that say nothing
 * about light — SENARE, CONTINUOUS, SAMMA — rather than a guess.
 */
export function lightOf(scene: Pick<SceneIndexEntry, 'timeOfDay'>): Light | null {
  const word = (scene.timeOfDay ?? '').trim().toUpperCase();
  if (!word) return null;
  if (NIGHT.has(word)) return 'night';
  if (DAY.has(word)) return 'day';
  return null;
}

/**
 * The strip's colour, by the convention every stripboard since paper has
 * used: interior day white, exterior day yellow, interior night blue,
 * exterior night green. A scene that is both inside and out counts as out,
 * because that is the half that depends on the weather and the light.
 */
export type StripColor = 'intDay' | 'extDay' | 'intNight' | 'extNight';

export function stripColor(scene: Pick<SceneIndexEntry, 'prefix' | 'heading' | 'timeOfDay'>): StripColor {
  const outside = settingOf(scene) !== 'INT' && settingOf(scene) !== null;
  const night = lightOf(scene) === 'night';
  if (outside) return night ? 'extNight' : 'extDay';
  return night ? 'intNight' : 'intDay';
}

/* ========================================================================== */
/* Cast                                                                       */
/* ========================================================================== */

/** Everyone in a scene: who speaks, and who is listed in `[[CAST:]]`. */
export function castOf(scene: Pick<SceneIndexEntry, 'speaking' | 'meta'>): string[] {
  const out: string[] = [];
  for (const name of [...scene.speaking, ...(scene.meta.cast ?? []).map((n) => n.trim().toUpperCase())]) {
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Cast numbers, the way a production office assigns them: 1 is the part in
 * the most scenes, and ties go to whoever appears first. A strip then shows
 * "1, 3, 7" instead of three names that would not fit.
 */
export function castNumbers(script: Pick<Script, 'scenes'>): Map<string, number> {
  const counts = new Map<string, { scenes: number; first: number }>();
  script.scenes.forEach((scene, index) => {
    for (const name of castOf(scene)) {
      const entry = counts.get(name);
      if (entry) entry.scenes += 1;
      else counts.set(name, { scenes: 1, first: index });
    }
  });
  const ordered = [...counts.entries()].sort((a, b) => b[1].scenes - a[1].scenes || a[1].first - b[1].first || a[0].localeCompare(b[0]));
  return new Map(ordered.map(([name], i) => [name, i + 1]));
}

/* ========================================================================== */
/* A day, summed up                                                           */
/* ========================================================================== */

export interface DaySummary {
  /** Scenes still in the script. */
  scenes: number;
  missing: number;
  eighths: number;
  /** Distinct locations, in shooting order. More than one is a company move. */
  locations: string[];
  cast: string[];
  hasDay: boolean;
  hasNight: boolean;
  /** Night work followed by day work on the same day: a turnaround that rarely works. */
  nightThenDay: boolean;
}

export function summariseDay(scenes: readonly SceneIndexEntry[], eighths: readonly number[], strips: readonly ResolvedStrip[]): DaySummary {
  const summary: DaySummary = { scenes: 0, missing: 0, eighths: 0, locations: [], cast: [], hasDay: false, hasNight: false, nightThenDay: false };
  let sawNight = false;
  for (const strip of strips) {
    const scene = strip.scene === null ? undefined : scenes[strip.scene];
    if (!scene || strip.scene === null) {
      summary.missing += 1;
      continue;
    }
    summary.scenes += 1;
    summary.eighths += eighths[strip.scene] ?? 0;
    const location = locationKey(scene);
    if (!summary.locations.includes(location)) summary.locations.push(location);
    for (const name of castOf(scene)) if (!summary.cast.includes(name)) summary.cast.push(name);
    const light = lightOf(scene);
    if (light === 'night') {
      summary.hasNight = true;
      sawNight = true;
    } else if (light === 'day') {
      summary.hasDay = true;
      if (sawNight) summary.nightThenDay = true;
    }
  }
  return summary;
}

const locationKey = (scene: Pick<SceneIndexEntry, 'location' | 'heading'>) => scene.location.trim().toUpperCase() || scene.heading.toUpperCase();

/* ========================================================================== */
/* Dates                                                                      */
/* ========================================================================== */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The date of the day at `index`, counting from `start`. Worked in UTC so a
 * daylight-saving change can never make two days share a date.
 */
export function dayDate(start: string | null | undefined, index: number, skipWeekends = false): string | null {
  if (!start || !ISO_DATE.test(start)) return null;
  const date = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const isWeekend = () => date.getUTCDay() === 0 || date.getUTCDay() === 6;
  if (skipWeekends) while (isWeekend()) date.setUTCDate(date.getUTCDate() + 1);
  let left = index;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (skipWeekends && isWeekend()) continue;
    left -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/* ========================================================================== */
/* A first draft                                                              */
/* ========================================================================== */

/**
 * Lays the unscheduled scenes out on new days after the existing ones.
 *
 * The way a first schedule is made by hand: everything at one location is
 * shot together, day work before night work, and a day is closed when the
 * next scene would push it past the target — or when it would mean going
 * from night back to day. Days already planned are never touched, so this
 * is safe to press after hours of arranging.
 *
 * @param idFor makes the new days' ids; injected so tests are deterministic.
 */
export function draftSchedule(
  scenes: readonly SceneIndexEntry[],
  eighths: readonly number[],
  board: Stripboard,
  idFor: () => string = newDayId,
): Stripboard {
  const { unscheduled } = resolveBoard(scenes, board);
  if (unscheduled.length === 0) return board;
  const target = board.targetEighths ?? DEFAULT_TARGET_EIGHTHS;

  // Locations in the order they first appear, so the draft reads like the script.
  const groups = new Map<string, number[]>();
  for (const index of unscheduled) {
    const scene = scenes[index] as SceneIndexEntry;
    const key = locationKey(scene);
    const list = groups.get(key) ?? [];
    list.push(index);
    groups.set(key, list);
  }

  const lightRank = (index: number) => (lightOf(scenes[index] as SceneIndexEntry) === 'night' ? 1 : 0);
  const order = [...groups.values()].flatMap((list) => [...list].sort((a, b) => lightRank(a) - lightRank(b) || a - b));

  const days: ShootDay[] = [];
  let current: ShootDay | null = null;
  let load = 0;
  let night = false;

  for (const index of order) {
    const length = eighths[index] ?? 0;
    const isNight = lightRank(index) === 1;
    const full = current !== null && current.strips.length > 0 && load + length > target;
    const turnaround = current !== null && night && !isNight;
    if (!current || full || turnaround) {
      current = { id: idFor(), strips: [] };
      days.push(current);
      load = 0;
      night = false;
    }
    current.strips.push(refOf(scenes, index));
    load += length;
    if (isNight) night = true;
  }

  return { ...board, days: [...board.days, ...days] };
}

/* ========================================================================== */
/* Export                                                                     */
/* ========================================================================== */

const BOM = '﻿';
const field = (value: string | number) => {
  const text = String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (rows: (string | number)[][]) => `${BOM}${rows.map((r) => r.map(field).join(';')).join('\r\n')}\r\n`;

/** Formats eighths the way a schedule does: `1 3/8`, `4/8`, `2`. */
export function eighthsLabel(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (rest === 0) return String(whole);
  return whole > 0 ? `${whole} ${rest}/8` : `${rest}/8`;
}

/**
 * The board as a one-liner schedule, for Excel: a row per strip, the day on
 * each row so it sorts and filters. Semicolons and a byte-order mark, like
 * the other reports, because that is what a Swedish Excel opens correctly.
 */
export function stripboardCsv(script: Pick<Script, 'scenes'>, eighths: readonly number[], board: Stripboard): string {
  const numbers = castNumbers(script);
  const resolved = resolveBoard(script.scenes, board);
  const rows: (string | number)[][] = [['Dag', 'Datum', 'Scen', 'I/E', 'Plats', 'Tid', 'Åttondelar', 'Roller', 'Synopsis']];
  const line = (day: string, date: string, index: number) => {
    const scene = script.scenes[index] as SceneIndexEntry;
    rows.push([
      day,
      date,
      scene.sceneNumber ?? index + 1,
      settingOf(scene) ?? '',
      scene.location,
      scene.timeOfDay ?? '',
      eighthsLabel(eighths[index] ?? 0),
      castOf(scene).map((n) => `${numbers.get(n) ?? ''} ${n}`.trim()).join(', '),
      scene.synopsis ?? '',
    ]);
  };
  resolved.days.forEach(({ strips }, i) => {
    const date = dayDate(board.startDate, i, board.skipWeekends) ?? '';
    for (const strip of strips) if (strip.scene !== null) line(String(i + 1), date, strip.scene);
  });
  for (const index of resolved.unscheduled) line('', '', index);
  return csv(rows);
}
