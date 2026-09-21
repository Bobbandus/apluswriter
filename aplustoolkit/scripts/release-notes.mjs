/**
 * The release notes for one version, taken out of CHANGELOG.md.
 *
 * The text a release carries and the text in the repository should never be
 * two different things, so the workflow reads them from here instead of the
 * tag message or a hand-written box on GitHub.
 *
 *   node scripts/release-notes.mjs 0.2.0 > notes.md
 *
 * Exits 1 when the version has no section, because a release with an empty
 * body is worse than a build that stopped and said why.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Pull one `## <version>` section out of a changelog.
 *
 * Returns null when that version is not in there. A leading `v` is accepted
 * on either side, so `v0.2.0` and `0.2.0` find the same section.
 */
export function releaseNotes(changelog, version) {
  const wanted = String(version).replace(/^v/, '');
  const lines = changelog.split(/\r?\n/);
  const heading = /^##\s+v?(.+?)\s*$/;

  let collecting = false;
  const out = [];

  for (const line of lines) {
    const match = heading.exec(line);
    if (match) {
      // A new section ends the one we were collecting.
      if (collecting) break;
      collecting = match[1].replace(/^v/, '') === wanted;
      continue;
    }
    if (collecting) out.push(line);
  }

  if (!collecting && out.length === 0) return null;
  const body = out.join('\n').trim();
  return body.length > 0 ? body : null;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('release-notes.mjs')) {
  const version = process.argv[2];
  if (!version) {
    console.error('usage: node scripts/release-notes.mjs <version>');
    process.exit(1);
  }
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const notes = releaseNotes(changelog, version);
  if (!notes) {
    console.error(`CHANGELOG.md has no section for ${version}. Add one before tagging.`);
    process.exit(1);
  }
  process.stdout.write(`${notes}\n`);
}
