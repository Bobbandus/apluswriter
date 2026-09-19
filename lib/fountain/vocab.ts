/**
 * The words A+ Write recognises.
 *
 * Fountain 1.1 only defines the scene-heading prefixes; everything else here
 * is vocabulary the app uses to read a heading intelligently and to offer
 * autocomplete. Swedish sits alongside English as a peer — a Swedish studio
 * writes `INT. MATSAL - DAG`, and an app that only understood `DAY` would get
 * the location wrong, not just the label.
 */

/* ========================================================================== */
/* Scene heading prefixes                                                     */
/* ========================================================================== */

/**
 * The spec's list, longest form first so `INT./EXT.` is not matched as `INT`.
 *
 * The trailing group is what stops `INTERIOR` from being read as a heading:
 * the prefix must be followed by a dot, whitespace, or the end of the line.
 */
export const SCENE_PREFIX_RE =
  /^(int\.?\s*\/\s*ext\.?|ext\.?\s*\/\s*int\.?|i\s*\/\s*e\.?|int\.?|ext\.?|est\.?)(?=\.|\s|$)/i;

/** `2. INT. MATSAL - DAG` — a numbered heading, common in Swedish drafts. */
export const NUMBERED_HEADING_RE = /^(\d+[A-Za-z]?)[.)]\s+(?=\S)/;

/** A trailing `#12A#` scene number. */
export const SCENE_NUMBER_RE = /\s*#([^#\n]+)#\s*$/;

/* ========================================================================== */
/* Times of day                                                               */
/* ========================================================================== */

/**
 * Recognised times of day, English and Swedish.
 *
 * This list is what decides whether the tail of `INT. HOUSE - KITCHEN` is a
 * time of day or part of the location. Splitting blindly on the last dash —
 * which is what most tools do — would file that scene under "HOUSE" with a
 * time of day of "KITCHEN", and the location report would be wrong.
 */
export const TIMES_OF_DAY_EN = [
  'DAY',
  'NIGHT',
  'MORNING',
  'EVENING',
  'AFTERNOON',
  'DUSK',
  'DAWN',
  'LATER',
  'MOMENTS LATER',
  'CONTINUOUS',
  'SAME',
  'SAME TIME',
  'SUNSET',
  'SUNRISE',
  'MIDNIGHT',
  'MAGIC HOUR',
  'NIGHTTIME',
  'DAYTIME',
] as const;

export const TIMES_OF_DAY_SV = [
  'DAG',
  'NATT',
  'KVÄLL',
  'MORGON',
  'FÖRMIDDAG',
  'EFTERMIDDAG',
  'SKYMNING',
  'GRYNING',
  'SENARE',
  'STRAX SENARE',
  'SAMMA',
  'SAMMA TID',
  'KONTINUERLIGT',
  'SOLNEDGÅNG',
  'SOLUPPGÅNG',
  'MIDNATT',
  'DAGTID',
  'NATTETID',
] as const;

export const TIMES_OF_DAY: readonly string[] = [...TIMES_OF_DAY_EN, ...TIMES_OF_DAY_SV];

const TIMES_OF_DAY_SET = new Set(TIMES_OF_DAY);

export function isTimeOfDay(value: string): boolean {
  return TIMES_OF_DAY_SET.has(value.trim().toUpperCase());
}

/**
 * The separators between a location and its time of day.
 *
 * Swedish keyboards produce en dashes freely, and a writer pasting from Word
 * gets em dashes, so all three have to count.
 */
export const TOD_SEPARATOR_RE = /\s+[-–—]\s+/g;

/* ========================================================================== */
/* Transitions                                                                */
/* ========================================================================== */

/** A transition is uppercase and ends in `TO:` — or is forced with `>`. */
export const TRANSITION_RE = /^[^a-z]*\bTO:$/;

/** Offered by autocomplete. Not used for recognition. */
export const COMMON_TRANSITIONS = [
  'CUT TO:',
  'DISSOLVE TO:',
  'SMASH CUT TO:',
  'MATCH CUT TO:',
  'JUMP CUT TO:',
  'FADE TO:',
  'FADE OUT.',
  'FADE IN:',
  'INTERCUT WITH:',
] as const;

/* ========================================================================== */
/* Character extensions                                                       */
/* ========================================================================== */

/**
 * Extensions offered by autocomplete.
 *
 * Recognition does not use this list — the spec allows any parenthetical
 * after a cue, including lowercase prose like `(on the radio)`.
 */
export const COMMON_EXTENSIONS = [
  "(CONT'D)",
  '(V.O.)',
  '(O.S.)',
  '(O.C.)',
  '(FORTS.)',
  '(BERÄTTARRÖST)',
] as const;

/** The English and Swedish "continued" markers, for auto-insertion. */
export const CONTD_EN = "(CONT'D)";
export const CONTD_SV = '(FORTS.)';

/** Matches any continued marker so we never insert a second one. */
export const CONTD_RE = /\((?:CONT'D|CONTD|CONT|FORTS\.?)\)/i;
