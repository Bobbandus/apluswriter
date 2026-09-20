/**
 * Overlay themes.
 *
 * A theme is a small JSON document: gradients, glass, glow, a border, a shape, a font. It is plain data on
 * purpose. The person writing it may be Claude, a designer or the operator, and it ends up in a style
 * attribute on a page that goes out live, so every value is checked here and nothing that is not a known
 * shape gets through. A colour is a hex, rgb or hsl value and never free text; no theme can carry a URL or
 * a stray declaration into the page.
 */

export type ThemeFont = 'display' | 'black' | 'ui' | 'mono';
export type ThemeLayout = 'bar' | 'stacked' | 'pill' | 'corner';
export type ThemeShadow = 'none' | 'soft' | 'deep';
export type ThemeScoreStyle = 'plain' | 'boxed' | 'glow';
export type ThemeAnimation = 'pop' | 'slide' | 'flip' | 'none';

export interface Theme {
  /** A name for the picker. */
  name: string;
  font: ThemeFont;
  layout: ThemeLayout;
  background: {
    /** Degrees, 0 (upwards) to 360. */
    angle: number;
    /** Two to four colours, blended along the angle. Semi-transparent colours let the picture through. */
    stops: string[];
  };
  text: string;
  /** Labels, the serve marker, the strip of results. */
  accent: string;
  /** The default colour of each side, used when a side has none of its own. */
  sides: [string, string];
  border: { width: number; color: string };
  /** A soft light around the board. Null for none. */
  glow: { color: string; blur: number } | null;
  /** How much the picture behind the board is blurred, in px. */
  glass: number;
  radius: number;
  shadow: ThemeShadow;
  scoreStyle: ThemeScoreStyle;
  animation: ThemeAnimation;
}

/* ------------------------------------------------------------------ validation */

const FONTS: ThemeFont[] = ['display', 'black', 'ui', 'mono'];
const LAYOUTS: ThemeLayout[] = ['bar', 'stacked', 'pill', 'corner'];
const SHADOWS: ThemeShadow[] = ['none', 'soft', 'deep'];
const SCORE_STYLES: ThemeScoreStyle[] = ['plain', 'boxed', 'glow'];
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

  let border = base.border;
  if (input['border'] !== undefined) {
    const raw = input['border'];
    if (!isObject(raw)) errors.push('border must be an object with width and color.');
    else border = { width: number('border.width', raw['width'], 0, 8, base.border.width), color: color('border.color', raw['color'], base.border.color) };
  }

  let glow = base.glow;
  if (input['glow'] !== undefined) {
    const raw = input['glow'];
    if (raw === null) glow = null;
    else if (!isObject(raw)) errors.push('glow must be null or an object with color and blur.');
    else glow = { color: color('glow.color', raw['color'], base.glow?.color ?? '#ffffff'), blur: number('glow.blur', raw['blur'], 0, 80, base.glow?.blur ?? 20) };
  }

  const theme: Theme = {
    name,
    font: choice('font', input['font'], FONTS, base.font),
    layout: choice('layout', input['layout'], LAYOUTS, base.layout),
    background,
    text: color('text', input['text'], base.text),
    accent: color('accent', input['accent'], base.accent),
    sides,
    border,
    glow,
    glass: number('glass', input['glass'], 0, 40, base.glass),
    radius: number('radius', input['radius'], 0, 40, base.radius),
    shadow: choice('shadow', input['shadow'], SHADOWS, base.shadow),
    scoreStyle: choice('scoreStyle', input['scoreStyle'], SCORE_STYLES, base.scoreStyle),
    animation: choice('animation', input['animation'], ANIMATIONS, base.animation),
  };

  return errors.length > 0 ? { ok: false, errors } : { ok: true, theme };
}

/* ------------------------------------------------------------------ to CSS */

const SHADOWS_CSS: Record<ThemeShadow, string> = {
  none: '0 0 0 rgba(0,0,0,0)',
  soft: '0 6px 20px rgba(0,0,0,0.35)',
  deep: '0 12px 40px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)',
};

/** The CSS variables a board is drawn from. Values here are always the validated ones. */
export function themeToCss(theme: Theme): Record<string, string> {
  const glow = theme.glow ? `0 0 ${theme.glow.blur}px ${theme.glow.color}, ` : '';
  return {
    '--lv-bg': `linear-gradient(${Math.round(theme.background.angle)}deg, ${theme.background.stops.join(', ')})`,
    '--lv-text': theme.text,
    '--lv-accent': theme.accent,
    '--lv-side-a': theme.sides[0],
    '--lv-side-b': theme.sides[1],
    '--lv-border': theme.border.width > 0 ? `${theme.border.width}px solid ${theme.border.color}` : 'none',
    '--lv-shadow': `${glow}${SHADOWS_CSS[theme.shadow]}`,
    '--lv-blur': theme.glass > 0 ? `blur(${theme.glass}px) saturate(140%)` : 'none',
    '--lv-radius': `${theme.radius}px`,
    '--lv-font': `var(--font-${theme.font})`,
  };
}

/* ------------------------------------------------------------------ the built-in themes */

/**
 * Nine themes that are meant to look like something: gradients, glass, glow, no flat fills. The first is the default.
 */
export const DEFAULT_THEMES: Theme[] = [
  {
    name: 'Studio glas',
    font: 'display',
    layout: 'bar',
    background: { angle: 155, stops: ['rgba(38,52,96,0.82)', 'rgba(14,18,38,0.72)'] },
    text: '#ffffff',
    accent: '#7cc4ff',
    sides: ['#5cb4f2', '#f2a65c'],
    border: { width: 1, color: 'rgba(255,255,255,0.28)' },
    glow: { color: 'rgba(92,180,242,0.35)', blur: 24 },
    glass: 18,
    radius: 16,
    shadow: 'soft',
    scoreStyle: 'plain',
    animation: 'pop',
  },
  {
    name: 'Neon natt',
    font: 'black',
    layout: 'bar',
    background: { angle: 135, stops: ['#12002b', '#3a0a6b', '#08111f'] },
    text: '#ffffff',
    accent: '#ff2bd6',
    sides: ['#ff2bd6', '#00e5ff'],
    border: { width: 2, color: '#ff2bd6' },
    glow: { color: 'rgba(255,43,214,0.7)', blur: 28 },
    glass: 0,
    radius: 10,
    shadow: 'deep',
    scoreStyle: 'glow',
    animation: 'pop',
  },
  {
    name: 'Guld',
    font: 'black',
    layout: 'bar',
    background: { angle: 165, stops: ['#f7e7a1', '#d4a72c', '#8a6508'] },
    text: '#1a1204',
    accent: '#5a3d00',
    sides: ['#7a1f1f', '#0f3a6b'],
    border: { width: 2, color: '#ffe9a0' },
    glow: { color: 'rgba(255,179,0,0.55)', blur: 22 },
    glass: 0,
    radius: 6,
    shadow: 'deep',
    scoreStyle: 'boxed',
    animation: 'flip',
  },
  {
    name: 'Isbana',
    font: 'display',
    layout: 'pill',
    background: { angle: 180, stops: ['rgba(236,248,255,0.9)', 'rgba(150,208,247,0.85)', 'rgba(74,144,201,0.85)'] },
    text: '#06263f',
    accent: '#0b5fa5',
    sides: ['#0b5fa5', '#c2410c'],
    border: { width: 1, color: 'rgba(255,255,255,0.8)' },
    glow: { color: 'rgba(160,220,255,0.6)', blur: 30 },
    glass: 10,
    radius: 30,
    shadow: 'soft',
    scoreStyle: 'plain',
    animation: 'slide',
  },
  {
    name: 'Arena',
    font: 'black',
    layout: 'bar',
    background: { angle: 100, stops: ['#0b1b3a', '#153f86', '#0b1b3a'] },
    text: '#ffffff',
    accent: '#ffcc00',
    sides: ['#e63946', '#2a9df4'],
    border: { width: 0, color: 'transparent' },
    glow: null,
    glass: 0,
    radius: 4,
    shadow: 'deep',
    scoreStyle: 'boxed',
    animation: 'pop',
  },
  {
    name: 'Retro-LED',
    font: 'mono',
    layout: 'stacked',
    background: { angle: 180, stops: ['#050505', '#141008'] },
    text: '#ff8a1f',
    accent: '#ffd24d',
    sides: ['#ff8a1f', '#ffd24d'],
    border: { width: 2, color: '#3a2200' },
    glow: { color: 'rgba(255,106,0,0.55)', blur: 16 },
    glass: 0,
    radius: 2,
    shadow: 'none',
    scoreStyle: 'glow',
    animation: 'none',
  },
  {
    name: 'Lava',
    font: 'black',
    layout: 'bar',
    background: { angle: 145, stops: ['#1a0505', '#7a0f0f', '#ff5a1f'] },
    text: '#ffffff',
    accent: '#ffe066',
    sides: ['#ffe066', '#ffffff'],
    border: { width: 1, color: 'rgba(255,224,102,0.6)' },
    glow: { color: 'rgba(255,61,0,0.6)', blur: 26 },
    glass: 0,
    radius: 14,
    shadow: 'deep',
    scoreStyle: 'glow',
    animation: 'pop',
  },
  {
    name: 'Solnedgång',
    font: 'display',
    layout: 'pill',
    background: { angle: 120, stops: ['#ff7e5f', '#feb47b', '#6a4c93'] },
    text: '#ffffff',
    accent: '#fff3c4',
    sides: ['#fff3c4', '#ffffff'],
    border: { width: 1, color: 'rgba(255,255,255,0.5)' },
    glow: { color: 'rgba(255,126,95,0.5)', blur: 26 },
    glass: 6,
    radius: 26,
    shadow: 'soft',
    scoreStyle: 'plain',
    animation: 'slide',
  },
  {
    name: 'Kolsvart',
    font: 'ui',
    layout: 'corner',
    background: { angle: 180, stops: ['#000000', '#151515'] },
    text: '#ffffff',
    accent: '#ffffff',
    sides: ['#ffffff', '#9a9a9a'],
    border: { width: 1, color: '#333333' },
    glow: null,
    glass: 0,
    radius: 8,
    shadow: 'soft',
    scoreStyle: 'plain',
    animation: 'none',
  },
];

/**
 * The theme format written out for a person or a model that has to produce one. Kept next to the validator so
 * the description and the rules cannot drift apart.
 */
export const THEME_FORMAT = `A theme is one JSON object. Every key is optional; what is left out takes the default.
{
  "name": "text, 1-40 characters",
  "font": "display | black | ui | mono",
  "layout": "bar | stacked | pill | corner",
  "background": { "angle": 0-360, "stops": ["2 to 4 colours"] },
  "text": "colour",
  "accent": "colour (labels, the serve marker, results)",
  "sides": ["colour of side A", "colour of side B"],
  "border": { "width": 0-8, "color": "colour" },
  "glow": { "color": "colour", "blur": 0-80 }   (or null for none),
  "glass": 0-40   (blur of the picture behind, in px),
  "radius": 0-40,
  "shadow": "none | soft | deep",
  "scoreStyle": "plain | boxed | glow",
  "animation": "pop | slide | flip | none"
}
A colour is #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(), transparent, white or black. Nothing else is accepted.`;
