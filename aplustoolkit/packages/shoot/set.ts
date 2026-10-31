import type { Shot, Shotlist } from '../bridge/protocol';
import type { SceneIndexEntry } from '../fountain/types';
import { SHOT_SIZES } from '../production/shotlist';
import { refOf, resolveRefs, type StripRef } from '../production/stripboard';

/**
 * A+ Shoot: what happens on set, kept beside the script.
 *
 * The script, its shotlists and its stripboard are read, never written, here.
 * What is stored is only what the set adds: whether each shot is in the can,
 * every take and how it went, blocking notes, the gear and the packing list,
 * and a few lines per shooting day. Scenes are pointed at the same way the
 * stripboard does it, so a scene renamed or moved in the script keeps its
 * takes.
 *
 * Pure functions over plain data. The page holds `ShootData` as project data.
 */

/* ========================================================================== */
/* Shapes                                                                     */
/* ========================================================================== */

export type ShotState = 'todo' | 'done' | 'skip';

export interface ShotProgress {
  state: ShotState;
}

/** One scene as the set sees it. `key` is ours and never changes; `ref` follows the script. */
export interface SceneShoot {
  key: string;
  ref: StripRef;
  /** Keyed by shot number ("1", "2A"). */
  shots: Record<string, ShotProgress>;
  blocking?: string;
}

export type TakeRating = 'good' | 'ng' | null;

export interface Take {
  id: string;
  /** The SceneShoot key, or null for a take slated by hand with no scene from the script. */
  scene: string | null;
  /** What the slate said, kept as written so the log reads right even if the script changes. */
  slate: string;
  shot: string | null;
  take: number;
  /** Timecode at the clap, or empty for a take logged without the slate. */
  tc: string;
  at: number;
  roll: string;
  rating: TakeRating;
  soundIssue: boolean;
  note: string;
  continuity: string;
}

export const GEAR_CATEGORIES = ['camera', 'lens', 'grip', 'light', 'sound', 'power', 'other'] as const;
export type GearCategory = (typeof GEAR_CATEGORIES)[number];

export interface GearItem {
  id: string;
  name: string;
  category: GearCategory;
  qty: number;
  note?: string;
}

/** What a shooting day adds to its strip on the board. */
export interface DayLog {
  call?: string;
  wrap?: string;
  note?: string;
  /** Written at wrap: what happened, for whoever reads the report. */
  report?: string;
}

export interface ShootCurrent {
  /** SceneShoot key on the slate. */
  scene: string | null;
  shot: string | null;
  /** Board day id, or null for "every scene". */
  day: string | null;
}

export interface ShootData {
  version: 1;
  scenes: SceneShoot[];
  takes: Take[];
  gear: GearItem[];
  /** Board day id → ids of the gear packed for it. */
  packed: Record<string, string[]>;
  days: Record<string, DayLog>;
  current: ShootCurrent;
}

export const emptyShoot = (): ShootData => ({
  version: 1,
  scenes: [],
  takes: [],
  gear: [],
  packed: {},
  days: {},
  current: { scene: null, shot: null, day: null },
});

/* ========================================================================== */
/* Reading stored data                                                        */
/* ========================================================================== */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown, max = 2000): string | undefined => (typeof value === 'string' ? value.slice(0, max) : undefined);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

let counter = 0;
/** A short id. Random plus a counter, so two made in one tick differ. */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${counter.toString(36)}`;
}

function readRef(value: unknown): StripRef | null {
  if (!isRecord(value)) return null;
  const { index, heading, sceneId } = value;
  if (!finite(index) || typeof heading !== 'string') return null;
  const ref: StripRef = { index: Math.max(0, Math.floor(index)), heading };
  if (typeof sceneId === 'string' && sceneId) ref.sceneId = sceneId;
  return ref;
}

const SHOT_STATES: readonly ShotState[] = ['todo', 'done', 'skip'];

function readScene(value: unknown): SceneShoot | null {
  if (!isRecord(value)) return null;
  const key = str(value['key'], 64);
  const ref = readRef(value['ref']);
  if (!key || !ref) return null;
  const shots: Record<string, ShotProgress> = {};
  if (isRecord(value['shots'])) {
    for (const [number, raw] of Object.entries(value['shots'])) {
      const state = isRecord(raw) ? raw['state'] : undefined;
      if (SHOT_STATES.includes(state as ShotState)) shots[number] = { state: state as ShotState };
    }
  }
  const scene: SceneShoot = { key, ref, shots };
  const blocking = str(value['blocking'], 10_000);
  if (blocking) scene.blocking = blocking;
  return scene;
}

function readTake(value: unknown): Take | null {
  if (!isRecord(value)) return null;
  const id = str(value['id'], 64);
  if (!id || !finite(value['at'])) return null;
  const rating = value['rating'] === 'good' || value['rating'] === 'ng' ? value['rating'] : null;
  return {
    id,
    scene: str(value['scene'], 64) ?? null,
    slate: str(value['slate'], 40) ?? '',
    shot: str(value['shot'], 40) ?? null,
    take: finite(value['take']) ? Math.max(1, Math.floor(value['take'])) : 1,
    tc: str(value['tc'], 20) ?? '',
    at: value['at'],
    roll: str(value['roll'], 40) ?? '',
    rating,
    soundIssue: value['soundIssue'] === true,
    note: str(value['note']) ?? '',
    continuity: str(value['continuity']) ?? '',
  };
}

function readGear(value: unknown): GearItem | null {
  if (!isRecord(value)) return null;
  const id = str(value['id'], 64);
  const name = str(value['name'], 200);
  if (!id || name === undefined) return null;
  const category = GEAR_CATEGORIES.includes(value['category'] as GearCategory) ? (value['category'] as GearCategory) : 'other';
  const item: GearItem = { id, name, category, qty: finite(value['qty']) ? Math.max(1, Math.floor(value['qty'])) : 1 };
  const note = str(value['note'], 500);
  if (note) item.note = note;
  return item;
}

/** Shoot data from whatever was stored, never throwing: a set that cannot open its log has lost it. */
export function readShoot(value: unknown): ShootData {
  const data = emptyShoot();
  if (!isRecord(value)) return data;
  if (Array.isArray(value['scenes'])) {
    const seen = new Set<string>();
    for (const raw of value['scenes']) {
      const scene = readScene(raw);
      if (scene && !seen.has(scene.key)) {
        seen.add(scene.key);
        data.scenes.push(scene);
      }
    }
  }
  if (Array.isArray(value['takes'])) data.takes = value['takes'].map(readTake).filter((t): t is Take => t !== null);
  if (Array.isArray(value['gear'])) data.gear = value['gear'].map(readGear).filter((g): g is GearItem => g !== null);
  if (isRecord(value['packed'])) {
    for (const [day, ids] of Object.entries(value['packed'])) {
      if (Array.isArray(ids)) data.packed[day] = ids.filter((id): id is string => typeof id === 'string');
    }
  }
  if (isRecord(value['days'])) {
    for (const [day, raw] of Object.entries(value['days'])) {
      if (!isRecord(raw)) continue;
      const log: DayLog = {};
      for (const k of ['call', 'wrap', 'note', 'report'] as const) {
        const v = str(raw[k], 10_000);
        if (v) log[k] = v;
      }
      data.days[day] = log;
    }
  }
  if (isRecord(value['current'])) {
    const c = value['current'];
    data.current = { scene: str(c['scene'], 64) ?? null, shot: str(c['shot'], 40) ?? null, day: str(c['day'], 64) ?? null };
  }
  return data;
}

/* ========================================================================== */
/* Scenes                                                                     */
/* ========================================================================== */

/** Script index → the set's record of that scene. Scenes the set has not touched are absent. */
export function sceneIndex(scenes: readonly SceneIndexEntry[], data: ShootData): Map<number, SceneShoot> {
  const found = resolveRefs(scenes, data.scenes.map((s) => s.ref));
  const map = new Map<number, SceneShoot>();
  data.scenes.forEach((scene, i) => {
    const index = found[i];
    if (index !== null && index !== undefined) map.set(index, scene);
  });
  return map;
}

/** The scene at `index` has a record; returns the data (new only if one had to be made) and its key. */
export function ensureScene(data: ShootData, scenes: readonly SceneIndexEntry[], index: number, key = newId('s')): { data: ShootData; key: string } {
  const existing = sceneIndex(scenes, data).get(index);
  if (existing) return { data, key: existing.key };
  const scene: SceneShoot = { key, ref: refOf(scenes, index), shots: {} };
  return { data: { ...data, scenes: [...data.scenes, scene] }, key };
}

/** Refs brought up to date with the script, the same object back when nothing moved. */
export function refreshShoot(scenes: readonly SceneIndexEntry[], data: ShootData): ShootData {
  const found = resolveRefs(scenes, data.scenes.map((s) => s.ref));
  let changed = false;
  const next = data.scenes.map((scene, i) => {
    const index = found[i];
    if (index === null || index === undefined) return scene;
    const ref = refOf(scenes, index);
    if (ref.index === scene.ref.index && ref.heading === scene.ref.heading && ref.sceneId === scene.ref.sceneId) return scene;
    changed = true;
    return { ...scene, ref };
  });
  return changed ? { ...data, scenes: next } : data;
}

const mapScene = (data: ShootData, key: string, fn: (scene: SceneShoot) => SceneShoot): ShootData => ({
  ...data,
  scenes: data.scenes.map((s) => (s.key === key ? fn(s) : s)),
});

export function setShotState(data: ShootData, key: string, shot: string, state: ShotState): ShootData {
  return mapScene(data, key, (s) => {
    const shots = { ...s.shots };
    if (state === 'todo') delete shots[shot];
    else shots[shot] = { state };
    return { ...s, shots };
  });
}

export function setBlocking(data: ShootData, key: string, text: string): ShootData {
  return mapScene(data, key, (s) => {
    const next = { ...s };
    if (text.trim()) next.blocking = text;
    else delete next.blocking;
    return next;
  });
}

export const shotState = (scene: SceneShoot | undefined, shot: string): ShotState => scene?.shots[shot]?.state ?? 'todo';

/* ========================================================================== */
/* The slate                                                                  */
/* ========================================================================== */

// I and O are left out, as on every slate: they read as 1 and 0.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 1 → A, 2 → B … 24 → Z, 25 → AA. */
export function shotLetter(n: number): string {
  let i = Math.max(1, Math.floor(n));
  let out = '';
  while (i > 0) {
    i -= 1;
    out = (LETTERS[i % LETTERS.length] as string) + out;
    i = Math.floor(i / LETTERS.length);
  }
  return out;
}

/** What goes in the SCENE box: scene 35, shot 1 → "35A". A shot numbered "2A" by hand stays readable as "35-2A". */
export function slateScene(sceneNumber: string, shot: string | null): string {
  if (!shot) return sceneNumber;
  return /^\d+$/.test(shot) ? `${sceneNumber}${shotLetter(Number(shot))}` : `${sceneNumber}-${shot}`;
}

/** The number a scene goes by: its own, or its place in the script. */
export const sceneNumberOf = (scenes: readonly SceneIndexEntry[], index: number): string => scenes[index]?.sceneNumber ?? String(index + 1);

export const takesOf = (data: ShootData, scene: string | null, shot: string | null): Take[] =>
  data.takes.filter((t) => t.scene === scene && t.shot === shot).sort((a, b) => a.take - b.take || a.at - b.at);

export function nextTake(data: ShootData, scene: string | null, shot: string | null): number {
  return takesOf(data, scene, shot).reduce((max, t) => Math.max(max, t.take), 0) + 1;
}

export function addTake(data: ShootData, take: Omit<Take, 'id'> & { id?: string }): ShootData {
  return { ...data, takes: [...data.takes, { ...take, id: take.id ?? newId('t') }] };
}

/**
 * A change to one take. Marking a take good also puts its shot in the can,
 * because that is what a good take means; taking the mark off again does not
 * undo it, since the shot may have another good take.
 */
export function updateTake(data: ShootData, id: string, patch: Partial<Omit<Take, 'id'>>): ShootData {
  const take = data.takes.find((t) => t.id === id);
  if (!take) return data;
  let next: ShootData = { ...data, takes: data.takes.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
  if (patch.rating === 'good' && take.scene && take.shot) {
    const scene = next.scenes.find((s) => s.key === take.scene);
    if (scene && shotState(scene, take.shot) === 'todo') next = setShotState(next, take.scene, take.shot, 'done');
  }
  return next;
}

export const removeTake = (data: ShootData, id: string): ShootData => ({ ...data, takes: data.takes.filter((t) => t.id !== id) });

export const setCurrent = (data: ShootData, patch: Partial<ShootCurrent>): ShootData => ({ ...data, current: { ...data.current, ...patch } });

/**
 * The shot after the current one: the next one in the list still to shoot,
 * wrapping round to the first. Null when every shot is done or skipped.
 */
export function nextOpenShot(shots: readonly Shot[], scene: SceneShoot | undefined, after: string | null): string | null {
  if (!shots.length) return null;
  const start = after === null ? -1 : shots.findIndex((s) => s.number === after);
  for (let step = 1; step <= shots.length; step++) {
    const shot = shots[(start + step + shots.length) % shots.length] as Shot;
    if (shotState(scene, shot.number) === 'todo' && shot.number !== after) return shot.number;
  }
  return null;
}

/* ========================================================================== */
/* Days                                                                       */
/* ========================================================================== */

export const setDayLog = (data: ShootData, day: string, patch: Partial<DayLog>): ShootData => {
  const log: DayLog = { ...data.days[day], ...patch };
  for (const k of Object.keys(log) as (keyof DayLog)[]) if (!log[k]) delete log[k];
  return { ...data, days: { ...data.days, [day]: log } };
};

/* ========================================================================== */
/* Gear                                                                       */
/* ========================================================================== */

export const addGear = (data: ShootData, item: Omit<GearItem, 'id'>, id = newId('g')): ShootData => ({ ...data, gear: [...data.gear, { ...item, id }] });

export const updateGear = (data: ShootData, id: string, patch: Partial<Omit<GearItem, 'id'>>): ShootData => ({
  ...data,
  gear: data.gear.map((g) => (g.id === id ? { ...g, ...patch, qty: Math.max(1, Math.floor(patch.qty ?? g.qty)) } : g)),
});

export function removeGear(data: ShootData, id: string): ShootData {
  const packed = Object.fromEntries(Object.entries(data.packed).map(([day, ids]) => [day, ids.filter((x) => x !== id)]));
  return { ...data, gear: data.gear.filter((g) => g.id !== id), packed };
}

export function togglePacked(data: ShootData, day: string, id: string): ShootData {
  const ids = data.packed[day] ?? [];
  return { ...data, packed: { ...data.packed, [day]: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] } };
}

/** Rigs a shot's movement calls for. Words in Swedish and English, as the shotlist is written in both. */
export const RIGS = ['tripod', 'dolly', 'slider', 'gimbal', 'handheld', 'crane', 'drone'] as const;
export type Rig = (typeof RIGS)[number];

const RIG_WORDS: Record<Rig, RegExp> = {
  tripod: /statisk|static|panor|pan\b|tilt|stativ|tripod|locked/i,
  dolly: /dolly|åkning|tracking|track\b|räls/i,
  slider: /slider/i,
  gimbal: /gimbal|steadicam|ronin/i,
  handheld: /handh|hand-?held|axel|shoulder/i,
  crane: /kran|crane|jib/i,
  drone: /drönare|drone|fpv/i,
};

export interface GearNeeds {
  /** Focal lengths in mm, low to high. */
  lenses: number[];
  rigs: Rig[];
}

export function gearNeeds(shots: readonly Shot[]): GearNeeds {
  const lenses = new Set<number>();
  const rigs = new Set<Rig>();
  for (const shot of shots) {
    if (shot.lens) lenses.add(shot.lens);
    const text = `${shot.movement ?? ''} ${shot.notes ?? ''}`;
    for (const rig of RIGS) if (RIG_WORDS[rig].test(text)) rigs.add(rig);
  }
  return { lenses: [...lenses].sort((a, b) => a - b), rigs: RIGS.filter((r) => rigs.has(r)) };
}

/** Whether the kit list seems to hold a lens: "35mm", "Sigma 35 1.4", "24-70" all count for 35. */
export function hasLens(gear: readonly GearItem[], mm: number): boolean {
  return gear.some((g) => {
    if (g.category !== 'lens' && !/mm|objektiv|lens/i.test(g.name)) return false;
    const zoom = /(\d{1,3})\s*[-–]\s*(\d{1,3})/.exec(g.name);
    if (zoom && Number(zoom[1]) <= mm && mm <= Number(zoom[2])) return true;
    // A bare number, not part of an aperture: "35" and "35mm" count, "f/2" and "2.8" do not.
    return new RegExp(`(^|[^\\d./])${mm}(\\s*mm|(?![\\d.]))`, 'i').test(g.name.replace(/(\d{1,3})\s*[-–]\s*(\d{1,3})/g, ''));
  });
}

/* ========================================================================== */
/* Blocking: the order to shoot a scene in                                   */
/* ========================================================================== */

const sizeRank = (size: string) => {
  const i = (SHOT_SIZES as readonly string[]).indexOf(size);
  // OTS, two-shot and POV sit with the mediums; inserts last.
  if (size === 'INSERT') return 100;
  if (size === 'OTS' || size === 'TWO') return 3.5;
  if (size === 'POV') return 4.5;
  return i < 0 ? 50 : i;
};

/**
 * A shooting order for a scene: widest first, so the light is set for the
 * whole room once and the closer shots match it; inserts last, when the actors
 * can be let go. Ties keep the shotlist's own order.
 */
export function shootingOrder(shots: readonly Shot[]): Shot[] {
  return shots
    .map((shot, i) => ({ shot, i }))
    .sort((a, b) => sizeRank(a.shot.size) - sizeRank(b.shot.size) || a.i - b.i)
    .map(({ shot }) => shot);
}

export type BlockingTip = 'wideFirst' | 'oneDirection' | 'insertsLast' | 'lensChanges' | 'moving' | 'manyCast' | 'night' | 'ext';

/** Which pieces of advice apply to this scene. The page words them. */
export function blockingTips(scene: Pick<SceneIndexEntry, 'speaking' | 'timeOfDay' | 'prefix' | 'heading'>, shots: readonly Shot[]): BlockingTip[] {
  const tips: BlockingTip[] = [];
  const sizes = shots.map((s) => s.size);
  const firstWide = shots.findIndex((s) => sizeRank(s.size) <= 2);
  if (firstWide > 0) tips.push('wideFirst');
  if (sizes.some((s) => s === 'OTS') || shots.some((s) => /reverse|motbild|omvänd/i.test(`${s.description} ${s.notes ?? ''}`))) tips.push('oneDirection');
  const insertAt = sizes.indexOf('INSERT');
  if (insertAt >= 0 && sizes.slice(insertAt + 1).some((s) => s !== 'INSERT')) tips.push('insertsLast');
  if (new Set(shots.map((s) => s.lens).filter(Boolean)).size >= 3) tips.push('lensChanges');
  if (gearNeeds(shots).rigs.some((r) => r !== 'tripod')) tips.push('moving');
  if (scene.speaking.length >= 3) tips.push('manyCast');
  const time = (scene.timeOfDay ?? '').toUpperCase();
  if (/NATT|NIGHT|KVÄLL|EVENING/.test(time)) tips.push('night');
  if (/^(EXT|UTE)/i.test(scene.prefix ?? scene.heading)) tips.push('ext');
  return tips;
}

/* ========================================================================== */
/* The day's report                                                           */
/* ========================================================================== */

export interface SceneReport {
  index: number;
  shots: number;
  done: number;
  skipped: number;
  takes: number;
  good: number;
  /** Every shot done or skipped, and at least one shot. */
  complete: boolean;
  started: boolean;
  /** Shots still to do, by number. */
  remaining: string[];
}

export interface DayReport {
  scenes: SceneReport[];
  shots: number;
  done: number;
  skipped: number;
  takes: number;
  good: number;
  complete: number;
  /** Takes logged today against no scene in the list (wild lines, pickups slated by hand). */
  otherTakes: number;
}

/**
 * Where a set of scenes stands. `takesSince` limits takes to those clapped
 * from that time on, so a report for today does not count yesterday's takes
 * of a scene that spans two days; shot states are cumulative by nature.
 */
export function dayReport(
  scenes: readonly number[],
  lists: ReadonlyMap<number, Shotlist>,
  data: ShootData,
  index: ReadonlyMap<number, SceneShoot>,
  takesSince = 0,
): DayReport {
  const report: DayReport = { scenes: [], shots: 0, done: 0, skipped: 0, takes: 0, good: 0, complete: 0, otherTakes: 0 };
  const keys = new Set<string>();
  for (const i of scenes) {
    const scene = index.get(i);
    if (scene) keys.add(scene.key);
    const shots = lists.get(i)?.shots ?? [];
    const takes = scene ? data.takes.filter((t) => t.scene === scene.key && t.at >= takesSince) : [];
    const r: SceneReport = { index: i, shots: shots.length, done: 0, skipped: 0, takes: takes.length, good: takes.filter((t) => t.rating === 'good').length, complete: false, started: false, remaining: [] };
    for (const shot of shots) {
      const state = shotState(scene, shot.number);
      if (state === 'done') r.done += 1;
      else if (state === 'skip') r.skipped += 1;
      else r.remaining.push(shot.number);
    }
    r.complete = r.shots > 0 && r.remaining.length === 0;
    r.started = r.done > 0 || r.takes > 0;
    report.scenes.push(r);
    report.shots += r.shots;
    report.done += r.done;
    report.skipped += r.skipped;
    report.takes += r.takes;
    report.good += r.good;
    if (r.complete) report.complete += 1;
  }
  report.otherTakes = data.takes.filter((t) => t.at >= takesSince && (t.scene === null || !keys.has(t.scene)) && takesSince > 0).length;
  return report;
}

/* ========================================================================== */
/* Export                                                                     */
/* ========================================================================== */

const BOM = '﻿';
const cell = (value: string | number) => {
  const text = String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const stamp = (at: number) => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** The take log for Excel: semicolons and a byte-order mark, like the other reports. */
export function takesCsv(takes: readonly Take[]): string {
  const rows: (string | number)[][] = [['Tid', 'Tidskod', 'Rulle', 'Scen', 'Bild', 'Tagning', 'Betyg', 'Ljud', 'Anteckning', 'Kontinuitet']];
  for (const t of [...takes].sort((a, b) => a.at - b.at)) {
    rows.push([
      stamp(t.at),
      t.tc,
      t.roll,
      t.slate,
      t.shot ?? '',
      t.take,
      t.rating === 'good' ? 'Bra' : t.rating === 'ng' ? 'NG' : '',
      t.soundIssue ? 'Problem' : '',
      t.note,
      t.continuity,
    ]);
  }
  return BOM + rows.map((row) => row.map(cell).join(';')).join('\r\n');
}
