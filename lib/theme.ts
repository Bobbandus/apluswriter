/**
 * Theme selection.
 *
 * All three themes are authored in `styles/tokens.css`. Dark is the default;
 * Midnight is true black for night writing. The chosen theme is written to a
 * cookie so the server can put `data-theme` on <html> in the first response —
 * without that, every load would flash the wrong theme.
 */

export const themes = ['light', 'dark', 'midnight'] as const;

export type Theme = (typeof themes)[number];

export const defaultTheme: Theme = 'dark';

export const THEME_COOKIE = 'aplus-theme';

/** One year. A writer picks a theme once. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (themes as readonly string[]).includes(value);
}
