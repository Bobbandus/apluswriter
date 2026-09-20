'use client';

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from '@/i18n/config';
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, resolveTheme, type Theme } from '@/lib/theme';

/**
 * Preferences the server has to know about on the very first render.
 *
 * Theme and locale both live in cookies rather than `localStorage`, because
 * the server needs them to emit `data-theme` and the right message catalogue
 * in the initial HTML. Reading them on the client instead would mean a flash
 * of the wrong theme on every load.
 */

function writeCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Applies a theme immediately and remembers it.
 *
 * The attribute is set directly rather than via React state so the change
 * lands in the same frame as the click — a theme switch that waits for a
 * re-render feels broken.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['themePref'] = theme;
  document.documentElement.dataset['theme'] = resolveTheme(theme, window.matchMedia('(prefers-color-scheme: dark)').matches);
  writeCookie(THEME_COOKIE, theme, THEME_COOKIE_MAX_AGE);
}

/**
 * Remembers a locale. The caller must then refresh the route, since the
 * message catalogue is resolved on the server.
 */
export function persistLocale(locale: Locale): void {
  writeCookie(LOCALE_COOKIE, locale, LOCALE_COOKIE_MAX_AGE);
}
