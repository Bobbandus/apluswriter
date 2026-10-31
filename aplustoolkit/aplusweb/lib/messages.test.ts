import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Swedish and English are peers: a key in one and not the other shows the
 * raw key to half the users. Checked for the namespaces this guards so far;
 * add a namespace here when it is known to be complete in both.
 */
const read = (locale: string) => JSON.parse(readFileSync(join(process.cwd(), `aplusweb/messages/${locale}.json`), 'utf8')) as Record<string, unknown>;

function keys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

const sv = read('sv');
const en = read('en');

describe('messages', () => {
  it.each(['production', 'toolkit', 'shoot', 'command', 'projects', 'assistant'])('has the same %s keys in Swedish and English', (namespace) => {
    expect(keys(en[namespace]).sort()).toEqual(keys(sv[namespace]).sort());
  });

  it('keeps option lists the same length in both languages', () => {
    const production = (locale: Record<string, unknown>) => locale['production'] as Record<string, string[]>;
    for (const list of ['angleOptions', 'movementOptions']) {
      expect(production(en)[list]?.length).toBe(production(sv)[list]?.length);
    }
  });
});
