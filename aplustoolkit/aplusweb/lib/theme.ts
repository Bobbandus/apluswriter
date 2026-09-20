/**
 * Theme selection.
 *
 * Light and dark are authored in `styles/tokens.css`. "System" is not a third look but a
 * preference: it follows the operating system and resolves to one of the two. The choice is
 * written to a cookie so the server can put `data-theme` on <html> in the first response —
 * without that, every load would flash the wrong theme.
 */

export const themes = ['light', 'dark', 'system'] as const;

export type Theme = (typeof themes)[number];

export const defaultTheme: Theme = 'dark';

export const THEME_COOKIE = 'aplus-theme';

/** One year. A writer picks a theme once. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (themes as readonly string[]).includes(value);
}

/** The look a preference stands for right now. Only "system" depends on the operating system. */
export function resolveTheme(pref: Theme, prefersDark: boolean): "light" | "dark" {
  return pref === "system" ? (prefersDark ? "dark" : "light") : pref;
}
