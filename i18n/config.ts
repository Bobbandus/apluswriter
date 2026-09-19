/**
 * Locale configuration, safe to import from both server and client.
 *
 * A+ Write puts the language toggle in settings rather than in the URL, so
 * there is no `/sv` / `/en` routing. The chosen locale lives in a cookie and
 * is read by `i18n/request.ts` on the server.
 */

export const locales = ['sv', 'en'] as const;

export type Locale = (typeof locales)[number];

/** Swedish is the default — A+ Studios is a Swedish studio. */
export const defaultLocale: Locale = 'sv';

export const LOCALE_COOKIE = 'aplus-locale';

/** One year. The writer's language is not a session preference. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const localeNames: Record<Locale, string> = {
  sv: 'Svenska',
  en: 'English',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}
