/**
 * SMPTE timecode for the slate.
 *
 * Two numbers are kept apart throughout. A *frame* is a real frame that went
 * past at the real rate (29.97 frames a second, say). A *label* is the
 * HH:MM:SS:FF that frame is called, counted in the nominal base (30). They are
 * the same number except in drop-frame, where labels skip to stay in step with
 * the wall clock.
 */

export const FRAME_RATES = ['23.976', '24', '25', '29.97', '29.97df', '30', '50', '59.94', '60'] as const;
export type FrameRate = (typeof FRAME_RATES)[number];

interface RateSpec {
  /** Frames per second the labels count in. */
  nominal: number;
  /** Frames per second that actually go past. */
  real: number;
  dropFrame: boolean;
}

const SPECS: Record<FrameRate, RateSpec> = {
  '23.976': { nominal: 24, real: 24000 / 1001, dropFrame: false },
  '24': { nominal: 24, real: 24, dropFrame: false },
  '25': { nominal: 25, real: 25, dropFrame: false },
  '29.97': { nominal: 30, real: 30000 / 1001, dropFrame: false },
  '29.97df': { nominal: 30, real: 30000 / 1001, dropFrame: true },
  '30': { nominal: 30, real: 30, dropFrame: false },
  '50': { nominal: 50, real: 50, dropFrame: false },
  '59.94': { nominal: 60, real: 60000 / 1001, dropFrame: false },
  '60': { nominal: 60, real: 60, dropFrame: false },
};

export const isFrameRate = (value: unknown): value is FrameRate => typeof value === 'string' && (FRAME_RATES as readonly string[]).includes(value);

export const rateSpec = (rate: FrameRate): RateSpec => SPECS[rate];

/** Labels in one day; timecode wraps at midnight. */
export const labelsPerDay = (rate: FrameRate): number => 24 * 3600 * SPECS[rate].nominal;

const wrap = (label: number, rate: FrameRate) => {
  const day = labelsPerDay(rate);
  return ((label % day) + day) % day;
};

/** 29.97 drop-frame: a real frame count to its label. Two labels skipped each minute, except every tenth. */
export function dropFrameLabel(frames: number): number {
  const perTen = 17982; // real frames in ten minutes
  const perMinute = 1798; // real frames in a minute that drops
  const tens = Math.floor(frames / perTen);
  const rest = frames % perTen;
  const skipped = 18 * tens + (rest < 2 ? 0 : 2 * Math.floor((rest - 2) / perMinute));
  return frames + skipped;
}

/** The inverse of {@link dropFrameLabel}. */
export function dropFrameFrames(label: number): number {
  const totalMinutes = Math.floor(label / (30 * 60));
  return label - 2 * (totalMinutes - Math.floor(totalMinutes / 10));
}

/** Real frames to label, for any rate. */
export const framesToLabel = (frames: number, rate: FrameRate): number => wrap(SPECS[rate].dropFrame ? dropFrameLabel(frames) : frames, rate);

/** Label to real frames, for any rate. */
export const labelToFrames = (label: number, rate: FrameRate): number => (SPECS[rate].dropFrame ? dropFrameFrames(label) : label);

const pad = (n: number) => String(n).padStart(2, '0');

/** "01:54:58:19". Drop-frame uses a semicolon before the frames, as every device does. */
export function formatTimecode(label: number, rate: FrameRate): string {
  const { nominal, dropFrame } = SPECS[rate];
  const l = wrap(Math.floor(label), rate);
  const ff = l % nominal;
  const totalSeconds = Math.floor(l / nominal);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${dropFrame ? ';' : ':'}${pad(ff)}`;
}

/**
 * Reads what someone typed: "01:54:58:19", "1;54;58;19", "01545819" or "1545819".
 * Returns the label, or null when it is not a timecode at this rate.
 */
export function parseTimecode(text: string, rate: FrameRate): number | null {
  const trimmed = text.trim();
  let parts: number[];
  if (/^\d{1,8}$/.test(trimmed)) {
    const digits = trimmed.padStart(8, '0');
    parts = [0, 2, 4, 6].map((i) => Number(digits.slice(i, i + 2)));
  } else {
    const pieces = trimmed.split(/[:;.,\s]+/);
    if (pieces.length !== 4 || pieces.some((p) => !/^\d{1,2}$/.test(p))) return null;
    parts = pieces.map(Number);
  }
  const [hh = 0, mm = 0, ss = 0, ff0 = 0] = parts;
  const { nominal, dropFrame } = SPECS[rate];
  if (hh > 23 || mm > 59 || ss > 59 || ff0 >= nominal) return null;
  // Labels 00 and 01 do not exist at the top of a drop minute; take the first one that does.
  const ff = dropFrame && ss === 0 && mm % 10 !== 0 && ff0 < 2 ? 2 : ff0;
  return ((hh * 60 + mm) * 60 + ss) * nominal + ff;
}

/** Seconds since local midnight, with the fraction. */
export function secondsSinceMidnight(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
}

/**
 * Time of day as timecode. Non-drop rates read the clock straight, so the
 * label says what the clock says. Drop-frame counts real frames since midnight,
 * which is what drop-frame exists to keep in step with the clock.
 */
export function timeOfDayLabel(date: Date, rate: FrameRate): number {
  const { nominal, real, dropFrame } = SPECS[rate];
  const seconds = secondsSinceMidnight(date);
  return dropFrame ? framesToLabel(Math.floor(seconds * real), rate) : wrap(Math.floor(seconds * nominal), rate);
}

/** Free run from a jam: started at `label` when the wall clock read `jammedAt`, counting real frames since. */
export function freeRunLabel(label: number, jammedAt: number, now: number, rate: FrameRate): number {
  const elapsed = Math.max(0, now - jammedAt) / 1000;
  return framesToLabel(labelToFrames(label, rate) + Math.floor(elapsed * SPECS[rate].real), rate);
}
