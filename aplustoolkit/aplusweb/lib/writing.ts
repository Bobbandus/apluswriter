/**
 * How much has been written, for the writing counter and writing sessions.
 *
 * "Written today" is a difference, not a running total of keystrokes: the word
 * count now, minus the count the first time this script was opened today.
 * Cutting a page and pasting it back therefore counts as nothing, which is the
 * honest answer, and there is no log to keep in step with the text.
 */

/** Words of the script itself: not the title page, notes, boneyard or section headings. */
export function scriptWords(source: string): number {
  const body = source
    .replace(/\r\n?/g, '\n')
    // A title page is a block of `Key: value` lines at the very top.
    .replace(/^(?:[A-Za-zÅÄÖåäö ]+:.*\n(?:[ \t]+.*\n)*)+\n?/, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\[\[[\s\S]*?\]\]/g, ' ')
    .replace(/^#+.*$/gm, ' ')
    .replace(/^=(?!==).*$/gm, ' ');
  return body.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** Local calendar day, `2026-09-20`. The writer's midnight, not UTC's. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface DayBaseline {
  day: string;
  words: number;
}

/** The baseline to use today: the stored one if it is from today, otherwise a fresh one from now. */
export function baselineFor(stored: DayBaseline | null | undefined, today: string, words: number): DayBaseline {
  return stored && stored.day === today ? stored : { day: today, words };
}

/** Words added since the baseline. Never negative: a day of cutting is not "written -300". */
export function writtenSince(baseline: DayBaseline | { words: number }, words: number): number {
  return Math.max(0, words - baseline.words);
}

/** `12:05`, or `1:02:07` past the hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}
