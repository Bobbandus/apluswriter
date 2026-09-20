import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { INDEX_FILE, mirrorScript, safeName } = require('./mirror.cjs') as {
  INDEX_FILE: string;
  mirrorScript: (dir: string, id: string, title: string, text: string) => string;
  safeName: (title: string) => string;
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aplus-mirror-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const files = () => readdirSync(dir).filter((name) => name !== INDEX_FILE).sort();

describe('file names', () => {
  it('keeps an ordinary title, å, ä and ö included', () => {
    expect(safeName('Nån Väckte Tigern')).toBe('Nån Väckte Tigern');
  });

  it('cannot escape the folder or hold characters a file system refuses', () => {
    expect(safeName('../../etc/passwd')).not.toMatch(/[\\/]/);
    expect(safeName('a<b>c:d"e|f?g*h')).toBe('a b c d e f g h');
    expect(safeName('..\\..\\Windows')).not.toMatch(/[\\/]/);
  });

  it('falls back to a plain name for an empty, dotted or reserved title', () => {
    for (const title of ['', '   ', '...', 'CON', 'nul', 'lpt1', null, undefined]) expect(safeName(title as string)).toBe('Manus');
  });

  it('never ends in a dot or a space, which Windows would drop', () => {
    expect(safeName('Slutet. ')).toBe('Slutet');
  });

  it('keeps a long title to a sensible length', () => {
    expect(safeName('x'.repeat(300)).length).toBeLessThanOrEqual(80);
  });
});

describe('mirroring', () => {
  it('writes the text as a .fountain file', () => {
    expect(mirrorScript(dir, 'a', 'Min film', 'INT. A - DAG\n')).toBe('Min film.fountain');
    expect(readFileSync(join(dir, 'Min film.fountain'), 'utf8')).toBe('INT. A - DAG\n');
  });

  it('overwrites the same script in place', () => {
    mirrorScript(dir, 'a', 'Min film', 'ett');
    mirrorScript(dir, 'a', 'Min film', 'två');
    expect(files()).toEqual(['Min film.fountain']);
    expect(readFileSync(join(dir, 'Min film.fountain'), 'utf8')).toBe('två');
  });

  it('renames the file with the script instead of leaving the old one behind', () => {
    mirrorScript(dir, 'a', 'Arbetstitel', 'text');
    mirrorScript(dir, 'a', 'Riktig titel', 'text 2');
    expect(files()).toEqual(['Riktig titel.fountain']);
  });

  it('gives two scripts with the same title a file each', () => {
    expect(mirrorScript(dir, 'a', 'Samma', 'ett')).toBe('Samma.fountain');
    expect(mirrorScript(dir, 'b', 'Samma', 'två')).toBe('Samma (2).fountain');
    expect(readFileSync(join(dir, 'Samma.fountain'), 'utf8')).toBe('ett');
    // And the first keeps its own name on the next save.
    expect(mirrorScript(dir, 'a', 'Samma', 'ett igen')).toBe('Samma.fountain');
  });

  it('does not clobber a file it did not write when a name is taken by another script', () => {
    mirrorScript(dir, 'a', 'Film', 'a');
    mirrorScript(dir, 'b', 'Annan', 'b');
    mirrorScript(dir, 'b', 'Film', 'b nu Film');
    expect(readFileSync(join(dir, 'Film.fountain'), 'utf8')).toBe('a');
    expect(existsSync(join(dir, 'Film (2).fountain'))).toBe(true);
  });

  it('never writes over a file that was not written by the app', () => {
    require('node:fs').writeFileSync(join(dir, 'Film.fountain'), 'mitt eget', 'utf8');
    expect(mirrorScript(dir, 'a', 'Film', 'appens')).toBe('Film (2).fountain');
    expect(readFileSync(join(dir, 'Film.fountain'), 'utf8')).toBe('mitt eget');
  });

  it('refuses a folder that is not there', () => {
    expect(() => mirrorScript(join(dir, 'saknas'), 'a', 'x', 'y')).toThrow();
    expect(() => mirrorScript('', 'a', 'x', 'y')).toThrow();
  });

  // Without the index the app can no longer tell its own files from the person's,
  // so it keeps writing but under a new name rather than over one it cannot vouch for.
  it('keeps writing when the index file is damaged, and overwrites nothing', () => {
    mirrorScript(dir, 'a', 'Film', 'a');
    require('node:fs').writeFileSync(join(dir, INDEX_FILE), '{oj', 'utf8');
    expect(mirrorScript(dir, 'a', 'Film', 'b')).toBe('Film (2).fountain');
    expect(readFileSync(join(dir, 'Film.fountain'), 'utf8')).toBe('a');
  });
});
