/**
 * Overlay themes.
 *
 * A theme picks one of the overlay designs and paints it: which colours go where, which typeface, how sharp
 * the corners are. The designs are drawn after real broadcast graphics (a table tennis lower panel with sets
 * and points boxes, full-width handball bars, a two-tone college scorebug, a Minecraft gold-block frame, a
 * plain name bar), because that is what a viewer's eye already reads as "a scoreboard". A design decides the
 * structure; the theme only decides the paint, so one design can be dressed in many colours.
 *
 * A theme is plain JSON on purpose. The person writing it may be Claude, a designer or the operator, and it
 * ends up in a style attribute on a page that goes out live, so every value is checked here and nothing that
 * is not a known shape gets through. A colour is a hex, rgb or hsl value and never free text; no theme can
 * carry a URL or a stray declaration into the page.
 */

export type ThemeDesign = 'broadcast' | 'college' | 'bars' | 'pixel' | 'block';
export type ThemeFont = 'condensed' | 'sans' | 'display' | 'pixel' | 'mono';
export type ThemeShadow = 'none' | 'soft' | 'deep';
export type ThemeAnimation = 'pop' | 'slide' | 'flip' | 'none';

export interface Theme {
  /** A name for the picker. */
  name: string;
  design: ThemeDesign;
  font: ThemeFont;
  /** The main panel: a navy bar, a gold block, the name bar. */
  primary: string;
  /** The boxes that carry the numbers: a red sets box, a score cell. */
  secondary: string;
  /** The second panel or the trim: the second row, the block edges. */
  tertiary: string;
  text: string;
  /** Marks: the serve triangle, the winner, a stripe. */
  accent: string;
  /** The colour of each side, for logo blocks and swatches when a side has none of its own. */
  sides: [string, string];
  /** A gradient for designs that have a backdrop (the handball bars). */
  background: { angle: number; stops: string[] };
  /** 0 is a sharp broadcast panel. */
  radius: number;
  shadow: ThemeShadow;
  animation: ThemeAnimation;
}

/* ------------------------------------------------------------------ validation */

export const DESIGNS: ThemeDesign[] = ['broadcast', 'college', 'bars', 'pixel', 'block'];
const FONTS: ThemeFont[] = ['condensed', 'sans', 'display', 'pixel', 'mono'];
const SHADOWS: ThemeShadow[] = ['none', 'soft', 'deep'];
const ANIMATIONS: ThemeAnimation[] = ['pop', 'slide', 'flip', 'none'];

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** rgb(), rgba(), hsl(), hsla(): numbers, percentages, commas, slashes and spaces, and nothing else. */
const FUNCTIONAL = /^(?:rgb|hsl)a?\(\s*[-\d.%\s,/]+(?:deg)?[-\d.%\s,/]*\)$/i;
const NAMED = new Set(['transparent', 'white', 'black']);

/** Whether a string is a colour that is safe to put in a style. */
export function isColor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && (HEX.test(value) || FUNCTIONAL.test(value) || NAMED.has(value.toLowerCase()));
}

export type ThemeResult = { ok: true; theme: Theme } | { ok: false; errors: string[] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads a theme from JSON. Anything missing takes the default; anything present must be valid, and every
 * problem is reported at once so it can be fixed in one go.
 */
export function validateTheme(input: unknown, base: Theme = DEFAULT_THEMES[0]!): ThemeResult {
  if (!isObject(input)) return { ok: false, errors: ['The theme must be a JSON object.'] };
  const errors: string[] = [];

  const color = (path: string, value: unknown, fallback: string): string => {
    if (value === undefined) return fallback;
    if (isColor(value)) return value;
    errors.push(`${path} must be a colour like #1a2b3c, rgba(20, 30, 40, 0.8) or hsl(210, 80%, 50%). Got ${JSON.stringify(value)}.`);
    return fallback;
  };
  const number = (path: string, value: unknown, min: number, max: number, fallback: number): number => {
    if (value === undefined) return fallback;
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) return value;
    errors.push(`${path} must be a number from ${min} to ${max}. Got ${JSON.stringify(value)}.`);
    return fallback;
  };
  const choice = <T extends string>(path: string, value: unknown, allowed: readonly T[], fallback: T): T => {
    if (value === undefined) return fallback;
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
    errors.push(`${path} must be one of ${allowed.join(', ')}. Got ${JSON.stringify(value)}.`);
    return fallback;
  };

  let name = base.name;
  if (input['name'] !== undefined) {
    if (typeof input['name'] === 'string' && input['name'].trim().length > 0 && input['name'].length <= 40) name = input['name'].trim();
    else errors.push('name must be text of 1 to 40 characters.');
  }

  let background = base.background;
  const rawBackground = input['background'];
  if (rawBackground !== undefined) {
    if (!isObject(rawBackground)) errors.push('background must be an object with angle and stops.');
    else {
      const angle = number('background.angle', rawBackground['angle'], 0, 360, base.background.angle);
      let stops = base.background.stops;
      const rawStops = rawBackground['stops'];
      if (rawStops !== undefined) {
        if (!Array.isArray(rawStops) || rawStops.length < 2 || rawStops.length > 4) errors.push('background.stops must be a list of 2 to 4 colours.');
        else if (!rawStops.every(isColor)) errors.push('background.stops must all be colours like #1a2b3c or rgba(20, 30, 40, 0.8).');
        else stops = rawStops as string[];
      }
      background = { angle, stops };
    }
  }

  let sides = base.sides;
  if (input['sides'] !== undefined) {
    const raw = input['sides'];
    if (Array.isArray(raw) && raw.length === 2 && raw.every(isColor)) sides = [raw[0] as string, raw[1] as string];
    else errors.push('sides must be a list of exactly two colours.');
  }

  const theme: Theme = {
    name,
    design: choice('design', input['design'], DESIGNS, base.design),
    font: choice('font', input['font'], FONTS, base.font),
    primary: color('primary', input['primary'], base.primary),
    secondary: color('secondary', input['secondary'], base.secondary),
    tertiary: color('tertiary', input['tertiary'], base.tertiary),
    text: color('text', input['text'], base.text),
    accent: color('accent', input['accent'], base.accent),
    sides,
    background,
    radius: number('radius', input['radius'], 0, 24, base.radius),
    shadow: choice('shadow', input['shadow'], SHADOWS, base.shadow),
    animation: choice('animation', input['animation'], ANIMATIONS, base.animation),
  };

  return errors.length > 0 ? { ok: false, errors } : { ok: true, theme };
}

/* ------------------------------------------------------------------ to CSS */

const SHADOWS_CSS: Record<ThemeShadow, string> = {
  none: 'none',
  soft: '0 4px 14px rgba(0,0,0,0.35)',
  deep: '0 10px 32px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.45)',
};

/** The CSS variables a board is drawn from. Values here are always the validated ones. */
export function themeToCss(theme: Theme): Record<string, string> {
  return {
    '--lv-primary': theme.primary,
    '--lv-secondary': theme.secondary,
    '--lv-tertiary': theme.tertiary,
    '--lv-text': theme.text,
    '--lv-accent': theme.accent,
    '--lv-side-a': theme.sides[0],
    '--lv-side-b': theme.sides[1],
    '--lv-backdrop': `linear-gradient(${Math.round(theme.background.angle)}deg, ${theme.background.stops.join(', ')})`,
    '--lv-radius': `${theme.radius}px`,
    '--lv-shadow': SHADOWS_CSS[theme.shadow],
    '--lv-font': `var(--font-live-${theme.font})`,
  };
}

/* ------------------------------------------------------------------ the built-in themes */

/**
 * Themes drawn after real broadcast graphics, one per design, so the first thing anyone sees is something that
 * already looks like television. The first is the default.
 */
export const DEFAULT_THEMES: Theme[] = [
  {
    // The lower panel of a table tennis world tour broadcast: navy, a red sets box, a navy points box, a serve marker.
    name: 'Bordtennis, sändning',
    design: 'broadcast',
    font: 'condensed',
    primary: '#1d2a6a',
    secondary: '#c8102e',
    tertiary: '#141d4c',
    text: '#ffffff',
    accent: '#ffffff',
    sides: ['#c8102e', '#1d2a6a'],
    background: { angle: 90, stops: ['#1d2a6a', '#141d4c'] },
    radius: 0,
    shadow: 'soft',
    animation: 'slide',
  },
  {
    // Full-width bars over a bright blue swoosh, big white numbers either side of two logo blocks.
    name: 'Handboll, slutresultat',
    design: 'bars',
    font: 'sans',
    primary: '#2f8fd6',
    secondary: '#ffffff',
    tertiary: '#1d6db0',
    text: '#ffffff',
    accent: '#7cc4f5',
    sides: ['#e2001a', '#0a0a0a'],
    background: { angle: 100, stops: ['#3b9ae0', '#57aeea', '#2a86cd', '#4aa3e4'] },
    radius: 0,
    shadow: 'none',
    animation: 'pop',
  },
  {
    // A two-tone scorebug: a light row and a dark row, and a dark block for the clock and the period.
    name: 'College, resultatplatta',
    design: 'college',
    font: 'condensed',
    primary: '#1f3350',
    secondary: '#c8202e',
    tertiary: '#ffffff',
    text: '#ffffff',
    accent: '#ffffff',
    sides: ['#c8202e', '#1f3350'],
    background: { angle: 180, stops: ['#1f3350', '#16253b'] },
    radius: 0,
    shadow: 'soft',
    animation: 'none',
  },
  {
    // Gold blocks in a pixel typeface, with a window cut out for the game.
    name: 'Minecraft, guld',
    design: 'pixel',
    font: 'pixel',
    primary: '#e7cf45',
    secondary: '#3a2a08',
    tertiary: '#b8952a',
    text: '#2a1a04',
    accent: '#f08a1a',
    sides: ['#3a2a08', '#3a2a08'],
    background: { angle: 180, stops: ['#f3dd62', '#d9bb34'] },
    radius: 0,
    shadow: 'none',
    animation: 'none',
  },
  {
    // A chunky name bar with a white stripe at the end.
    name: 'Namnskylt, blå',
    design: 'block',
    font: 'sans',
    primary: '#0d1b4e',
    secondary: '#ffffff',
    tertiary: '#0d1b4e',
    text: '#ffffff',
    accent: '#ffffff',
    sides: ['#ffffff', '#ffffff'],
    background: { angle: 180, stops: ['#0d1b4e', '#0a1640'] },
    radius: 0,
    shadow: 'soft',
    animation: 'slide',
  },
];

/**
 * The theme format written out for a person or a model that has to produce one. Kept next to the validator so
 * the description and the rules cannot drift apart.
 */
export const THEME_FORMAT = `A theme is one JSON object. Every key is optional; what is left out takes the default.
{
  "name": "text, 1-40 characters",
  "design": "broadcast | college | bars | pixel | block",
  "font": "condensed | sans | display | pixel | mono",
  "primary": "colour: the main panel",
  "secondary": "colour: the boxes that carry numbers",
  "tertiary": "colour: the second row or the trim",
  "text": "colour",
  "accent": "colour: serve marker, winner, stripe",
  "sides": ["colour of side A", "colour of side B"],
  "background": { "angle": 0-360, "stops": ["2 to 4 colours"] },
  "radius": 0-24   (0 is a sharp broadcast panel),
  "shadow": "none | soft | deep",
  "animation": "pop | slide | flip | none"
}
The design decides the structure: broadcast is a lower panel with a name row per side, a sets box and a points box
(table tennis, scores); college is a light row and a dark row with a clock block; bars is a full-width top bar for
a heading and a bottom bar with the two scores and two logo blocks (handball); pixel is a gold block frame with a
window for the game; block is a name bar for lower thirds. A colour is #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(),
hsl(), hsla(), transparent, white or black. Nothing else is accepted.`;
