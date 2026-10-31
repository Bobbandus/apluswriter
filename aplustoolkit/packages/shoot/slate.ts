import { freeRunLabel, isFrameRate, rateSpec, timeOfDayLabel, type FrameRate } from './timecode';

/**
 * The slate: what is written on it, how its clock runs, and the claps it has
 * made. Plain data and pure functions, so the page only draws it and the rules
 * can be tested without a browser.
 */

/** The fields written on the board, in the order the board shows them. */
export const SLATE_FIELDS = ['roll', 'scene', 'take', 'prod', 'dir', 'dop', 'note', 'date'] as const;
export type SlateField = (typeof SLATE_FIELDS)[number];

export type TimecodeMode = 'tod' | 'jam';

export interface Jam {
  /** The label the clock was set to. */
  label: number;
  /** Wall-clock milliseconds when it was set. */
  at: number;
}

export interface ClapRecord {
  at: number;
  tc: string;
  roll: string;
  scene: string;
  take: number;
  note: string;
}

export interface SlateState {
  roll: string;
  scene: string;
  take: number;
  prod: string;
  dir: string;
  dop: string;
  note: string;
  /** Empty means today, and follows the calendar. */
  date: string;
  /** What each box is called. Editable: not every production says DOP. */
  labels: Record<SlateField, string>;
  rate: FrameRate;
  tcMode: TimecodeMode;
  jam: Jam | null;
  /** Count the take up when the sticks open after a clap. */
  autoTake: boolean;
  sound: boolean;
  /** Sticks shut: the timecode stands still on the frame of the clap. */
  closed: boolean;
  frozenTc: string | null;
  /** Set by a clap, cleared by opening or by changing roll, scene or take by hand. */
  advancePending: boolean;
  log: ClapRecord[];
}

export const LOG_LIMIT = 500;

export const DEFAULT_LABELS: Record<SlateField, string> = {
  roll: 'ROLL',
  scene: 'SCENE',
  take: 'TAKE',
  prod: 'PROD',
  dir: 'DIR',
  dop: 'DOP',
  note: 'NOTE',
  date: 'DATE',
};

export function defaultSlate(): SlateState {
  return {
    roll: 'A001',
    scene: '1',
    take: 1,
    prod: '',
    dir: '',
    dop: '',
    note: '',
    date: '',
    labels: { ...DEFAULT_LABELS },
    rate: '25',
    tcMode: 'tod',
    jam: null,
    autoTake: true,
    sound: true,
    closed: false,
    frozenTc: null,
    advancePending: false,
    log: [],
  };
}

const str = (value: unknown, fallback: string, max = 200) => (typeof value === 'string' ? value.slice(0, max) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const clampTake = (take: number) => Math.min(9999, Math.max(1, Math.floor(take)));

/** Whatever came out of storage, made safe. Unknown or broken parts fall back to defaults. */
export function normalizeSlate(raw: unknown): SlateState {
  const base = defaultSlate();
  if (raw === null || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const rawLabels = (r['labels'] && typeof r['labels'] === 'object' ? r['labels'] : {}) as Record<string, unknown>;
  const labels = Object.fromEntries(SLATE_FIELDS.map((f) => [f, str(rawLabels[f], DEFAULT_LABELS[f], 24)])) as Record<SlateField, string>;
  const jamRaw = r['jam'] as Record<string, unknown> | null | undefined;
  const jam = jamRaw && finite(jamRaw['label']) && finite(jamRaw['at']) ? { label: jamRaw['label'], at: jamRaw['at'] } : null;
  const log = Array.isArray(r['log'])
    ? (r['log'] as unknown[])
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
        .filter((e) => finite(e['at']) && typeof e['tc'] === 'string')
        .map((e) => ({
          at: e['at'] as number,
          tc: e['tc'] as string,
          roll: str(e['roll'], ''),
          scene: str(e['scene'], ''),
          take: finite(e['take']) ? clampTake(e['take']) : 1,
          note: str(e['note'], '', 500),
        }))
        .slice(0, LOG_LIMIT)
    : [];
  const closed = bool(r['closed'], false);
  const frozenTc = typeof r['frozenTc'] === 'string' ? r['frozenTc'] : null;

  return {
    roll: str(r['roll'], base.roll),
    scene: str(r['scene'], base.scene),
    take: finite(r['take']) ? clampTake(r['take']) : base.take,
    prod: str(r['prod'], base.prod),
    dir: str(r['dir'], base.dir),
    dop: str(r['dop'], base.dop),
    note: str(r['note'], base.note, 500),
    date: str(r['date'], base.date, 40),
    labels,
    rate: isFrameRate(r['rate']) ? r['rate'] : base.rate,
    // Free run needs somewhere to run from.
    tcMode: r['tcMode'] === 'jam' && jam ? 'jam' : 'tod',
    jam,
    autoTake: bool(r['autoTake'], base.autoTake),
    sound: bool(r['sound'], base.sound),
    // Shut without a frozen reading would show a running clock on a closed slate.
    closed: closed && frozenTc !== null,
    frozenTc: closed ? frozenTc : null,
    advancePending: bool(r['advancePending'], false),
    log,
  };
}

/** The label the clock reads right now. */
export function currentLabel(state: Pick<SlateState, 'rate' | 'tcMode' | 'jam'>, now: number): number {
  if (state.tcMode === 'jam') {
    const jam = state.jam ?? { label: 0, at: now };
    return freeRunLabel(jam.label, jam.at, now, state.rate);
  }
  return timeOfDayLabel(new Date(now), state.rate);
}

/**
 * A new frame rate. The time of day needs nothing more; a free-running clock
 * carries on from what it reads now, re-counted in the new rate, rather than
 * jumping.
 */
export function changeRate(state: SlateState, rate: FrameRate, now: number): Partial<SlateState> {
  if (state.tcMode !== 'jam') return { rate };
  const seconds = currentLabel(state, now) / rateSpec(state.rate).nominal;
  return { rate, jam: { label: Math.floor(seconds * rateSpec(rate).nominal), at: now } };
}

/** Sticks meet: the clock freezes on `tc` and the clap goes in the log. */
export function clap(state: SlateState, tc: string, now: number): SlateState {
  if (state.closed) return state;
  const record: ClapRecord = { at: now, tc, roll: state.roll, scene: state.scene, take: state.take, note: state.note };
  return { ...state, closed: true, frozenTc: tc, advancePending: true, log: [record, ...state.log].slice(0, LOG_LIMIT) };
}

/** Sticks open: the clock runs again, and the take moves on if the last one was clapped. */
export function open(state: SlateState): SlateState {
  if (!state.closed) return state;
  const advance = state.autoTake && state.advancePending;
  return { ...state, closed: false, frozenTc: null, advancePending: false, take: advance ? clampTake(state.take + 1) : state.take };
}

/**
 * A change from the settings panel. Setting roll, scene or take by hand means
 * the next take is already decided, so opening must not count it up again.
 */
export function edit(state: SlateState, patch: Partial<SlateState>): SlateState {
  const next = { ...state, ...patch };
  if (patch.take !== undefined) next.take = clampTake(patch.take);
  if (patch.roll !== undefined || patch.scene !== undefined || patch.take !== undefined) next.advancePending = false;
  return next;
}

/** "11 / 12 / 22", the way slates are written. */
export function slateDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())} / ${p(date.getMonth() + 1)} / ${p(date.getFullYear() % 100)}`;
}

/** The log as tab-separated text, ready to paste into a sheet or a message. */
export function logAsText(log: ClapRecord[], labels: Record<SlateField, string> = DEFAULT_LABELS): string {
  const head = ['TC', labels.roll, labels.scene, labels.take, labels.note, 'TIME'].join('\t');
  const rows = [...log].reverse().map((r) => {
    const d = new Date(r.at);
    const p = (n: number) => String(n).padStart(2, '0');
    const time = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    return [r.tc, r.roll, r.scene, String(r.take), r.note.replace(/\s+/g, ' '), time].join('\t');
  });
  return [head, ...rows].join('\n');
}
