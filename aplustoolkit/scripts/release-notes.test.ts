import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — a build script, deliberately plain JavaScript.
import { releaseNotes } from './release-notes.mjs';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const CHANGELOG = fs.readFileSync(at('../CHANGELOG.md'), 'utf8');

const sample = `# Ändringar

Preamble that belongs to nobody.

## 0.2.0

New things.

More new things.

## 0.1.0

The first one.
`;

describe('releaseNotes', () => {
  it('takes one section and stops at the next heading', () => {
    expect(releaseNotes(sample, '0.2.0')).toBe('New things.\n\nMore new things.');
  });

  it('reads the last section without running off the end', () => {
    expect(releaseNotes(sample, '0.1.0')).toBe('The first one.');
  });

  it('accepts a leading v on either side', () => {
    expect(releaseNotes(sample, 'v0.2.0')).toBe(releaseNotes(sample, '0.2.0'));
  });

  it('returns null for a version that is not there', () => {
    expect(releaseNotes(sample, '9.9.9')).toBeNull();
  });

  it('never returns the preamble as if it were notes', () => {
    expect(releaseNotes(sample, 'Ändringar')).toBeNull();
  });

  /* The one that matters: the version being released must have a section, or
     the release goes out with an empty body. */
  it('has a section for the version in aplusdesktop/package.json', () => {
    const version = JSON.parse(fs.readFileSync(at('../aplusdesktop/package.json'), 'utf8')).version;
    expect(releaseNotes(CHANGELOG, version)).toBeTruthy();
  });
});
