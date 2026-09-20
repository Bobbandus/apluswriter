import { serializeTitlePage } from './serialize';
import type { Script, TitlePageField } from './types';

/**
 * The title page as a form.
 *
 * A Fountain title page is a block of `Key: value` lines at the top of the
 * file. The form edits the fields a writer actually fills in and leaves every
 * other key exactly as written (Revision, Draft date order, a custom key from
 * another app), so opening the form never costs a field the form does not know.
 */

export const TITLE_FIELDS = [
  { key: 'title', rawKey: 'Title', multiline: false },
  { key: 'credit', rawKey: 'Credit', multiline: false },
  { key: 'author', rawKey: 'Author', multiline: false },
  { key: 'source', rawKey: 'Source', multiline: false },
  { key: 'draft date', rawKey: 'Draft date', multiline: false },
  { key: 'contact', rawKey: 'Contact', multiline: true },
  { key: 'copyright', rawKey: 'Copyright', multiline: false },
  { key: 'notes', rawKey: 'Notes', multiline: true },
] as const;

export type TitleValues = Record<(typeof TITLE_FIELDS)[number]['key'], string>;

/** Swedish spellings of the same keys, which the exporters already understand. */
const ALIASES: Record<string, keyof TitleValues> = {
  titel: 'title',
  författare: 'author',
  kontakt: 'contact',
  upphovsrätt: 'copyright',
  datum: 'draft date',
};
const canonical = (key: string): string => ALIASES[key] ?? key;

/** What the form starts from: each known field as text, lines joined. */
export function readTitleValues(script: Script): TitleValues {
  const out = Object.fromEntries(TITLE_FIELDS.map((field) => [field.key, ''])) as TitleValues;
  for (const field of script.titlePage?.fields ?? []) {
    const key = canonical(field.key);
    if (key in out && !out[key as keyof TitleValues]) out[key as keyof TitleValues] = field.values.join('\n');
  }
  return out;
}

/** True for a key the form owns, as opposed to one it must leave alone. */
const owned = (key: string) => TITLE_FIELDS.some((field) => field.key === canonical(key));

/**
 * The edit that makes the title page say `values`, as one replacement over the
 * source. Fields the form does not know are kept in place and in order; new
 * ones go after them in the usual order; an empty field disappears; when
 * nothing is left the whole block, and the blank lines after it, go.
 */
export function titlePageEdit(script: Script, values: Partial<TitleValues>): { from: number; to: number; insert: string } | null {
  const current = readTitleValues(script);
  const next = { ...current, ...values };
  const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);

  const fields: TitlePageField[] = [];
  const written = new Set<string>();

  for (const field of script.titlePage?.fields ?? []) {
    if (!owned(field.key)) {
      fields.push(field);
    } else if (!written.has(canonical(field.key))) {
      written.add(canonical(field.key));
      const value = lines(next[canonical(field.key) as keyof TitleValues]);
      if (value.length > 0) fields.push({ ...field, values: value });
    }
  }
  for (const known of TITLE_FIELDS) {
    if (written.has(known.key)) continue;
    const value = lines(next[known.key]);
    if (value.length > 0) fields.push({ key: known.key, rawKey: known.rawKey, values: value, from: 0, to: 0 });
  }

  const page = script.titlePage;
  const body = fields.length > 0 ? serializeTitlePage({ fields, from: 0, to: 0 }) : '';

  if (!page) return body ? { from: 0, to: 0, insert: `${body}\n\n` } : null;

  if (body) {
    const text = script.source.slice(page.from, page.to);
    return text === body ? null : { from: page.from, to: page.to, insert: body };
  }

  // Everything is cleared: take the block and the blank lines that separated it from the script.
  let end = page.to;
  while (end < script.source.length && /\s/.test(script.source[end] ?? '')) end++;
  return { from: page.from, to: end, insert: '' };
}
