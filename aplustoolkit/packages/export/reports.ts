import type { Script } from '../fountain/types';

/**
 * Reports a production asks for, as CSV.
 *
 * Semicolon-separated with a UTF-8 byte-order mark. That is not what CSV
 * "should" be, it is what opens correctly by double-click in a Swedish Excel,
 * where the list separator is a semicolon and a file without the mark turns
 * å, ä and ö into garbage. A producer who cannot open the attachment does not
 * care that the file was standards-compliant.
 */

export type ReportKind = 'scenes' | 'characters' | 'locations';

const BOM = '﻿';

/** Quote a field if it has anything that would break the row. */
function field(value: string | number): string {
  const text = String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const row = (values: (string | number)[]) => values.map(field).join(';');
const table = (header: string[], rows: (string | number)[][]) =>
  `${BOM}${[header, ...rows].map(row).join('\r\n')}\r\n`;

/**
 * @param eighths length of each scene in eighths of a page, indexed like the
 *   scenes, when the pagination is at hand. Left blank rather than invented.
 */
export function sceneReport(script: Script, eighths?: readonly number[]): string {
  return table(
    ['Scen', 'Rubrik', 'Plats', 'Tid', 'Roller', 'Åttondelar', 'Synopsis'],
    script.scenes.map((scene, index) => [
      scene.sceneNumber ?? index + 1,
      scene.heading,
      scene.location,
      scene.timeOfDay ?? '',
      scene.speaking.join(', '),
      eighths?.[index] ?? '',
      scene.synopsis ?? '',
    ]),
  );
}

export function characterReport(script: Script): string {
  return table(
    ['Roll', 'Repliker', 'Ord', 'Scener', 'Första scen'],
    script.characters.map((character) => [
      character.name,
      character.cues,
      character.words,
      character.scenes.length,
      script.scenes[character.scenes[0] ?? -1]?.heading ?? '',
    ]),
  );
}

export function locationReport(script: Script): string {
  return table(
    ['Plats', 'INT/EXT', 'Tider', 'Scener'],
    script.locations.map((location) => [
      location.name,
      location.prefixes.join(' / '),
      location.timesOfDay.join(' / '),
      location.scenes.length,
    ]),
  );
}

export function renderReport(kind: ReportKind, script: Script, eighths?: readonly number[]): string {
  return kind === 'scenes' ? sceneReport(script, eighths) : kind === 'characters' ? characterReport(script) : locationReport(script);
}
