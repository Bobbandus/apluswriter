import { parse } from './parse';

/**
 * Other versions of a scene, kept in the script itself.
 *
 * "Try scene 4 another way without losing the old one." Only the active version
 * is script; the others are parked right after the scene as a boneyard block:
 *
 *     /* aplus:alt Version med regn
 *     EXT. GATA - NATT
 *
 *     Det regnar hårt.
 *     *​/
 *
 * Boneyard because every Fountain app ignores it, so the file stays valid and
 * nothing prints; because it sits inside the scene, a scene that moves takes
 * its alternatives with it; and because it is text, it syncs, versions and
 * undoes like the rest of the script. There is no second store to fall out of
 * step.
 *
 * A boneyard ends at the first star-slash, so any star-slash inside a parked
 * scene is written with a backslash between the two and restored on the way
 * back out.
 */

const OPEN = '/* aplus:alt';
const CLOSE = '*/';
const ESCAPED_CLOSE = '*\\/';

export interface Alternative {
  label: string;
  /** The parked scene, exactly as it would read if it were the active one. */
  text: string;
}

interface Located extends Alternative {
  /** Where the whole block sits in the source. */
  from: number;
  to: number;
}

const escape = (text: string) => text.split(CLOSE).join(ESCAPED_CLOSE);
const unescape = (text: string) => text.split(ESCAPED_CLOSE).join(CLOSE);

const block = (label: string, text: string) => `${OPEN} ${label.replace(/[\r\n]+/g, ' ').trim()}\n${escape(text)}\n${CLOSE}`;

/** The scene, its alternatives, and where the active text ends. */
function locate(source: string, sceneIndex: number) {
  const scene = parse(source).scenes[sceneIndex];
  if (!scene) return null;

  const alts: Located[] = [];
  const slice = source.slice(scene.from, scene.to);
  const pattern = /\/\* aplus:alt ([^\n]*)\n([\s\S]*?)\n\*\//g;
  for (let match = pattern.exec(slice); match; match = pattern.exec(slice)) {
    alts.push({
      label: (match[1] ?? '').trim(),
      text: unescape(match[2] ?? ''),
      from: scene.from + match.index,
      to: scene.from + match.index + match[0].length,
    });
  }

  // The active version runs to the first parked one, or the end of the scene.
  const end = alts[0]?.from ?? scene.to;
  const active = source.slice(scene.from, end).replace(/\s+$/, '');
  return { scene, alts, activeEnd: scene.from + active.length, active, sceneEnd: scene.to };
}

/** What is parked for a scene. */
export function alternativesOf(source: string, sceneIndex: number): Alternative[] {
  return (locate(source, sceneIndex)?.alts ?? []).map(({ label, text }) => ({ label, text }));
}

/** Rewrites a scene as its active text followed by a list of parked ones. */
function rebuild(source: string, sceneIndex: number, active: string, parked: Alternative[]): string {
  const at = locate(source, sceneIndex);
  if (!at) return source;

  // The scene's own trailing blank lines stay with the position, not the text,
  // so the spacing between scenes is the writer's and does not drift.
  const gap = /\s*$/.exec(source.slice(at.scene.from, at.sceneEnd))?.[0] ?? '';
  const body = [active, ...parked.map((alt) => block(alt.label, alt.text))].join('\n\n');
  return source.slice(0, at.scene.from) + body + gap + source.slice(at.sceneEnd);
}

/** Keeps a copy of the scene as it is now, and carries on with the active one. */
export function saveAlternative(source: string, sceneIndex: number, label: string): string {
  const at = locate(source, sceneIndex);
  if (!at) return source;
  return rebuild(source, sceneIndex, at.active, [...at.alts.map(({ label: l, text }) => ({ label: l, text })), { label, text: at.active }]);
}

/**
 * Makes a parked version the active one. What was active is parked in its
 * place, so a swap loses nothing and swapping again undoes it.
 */
export function swapAlternative(source: string, sceneIndex: number, index: number, outgoingLabel: string): string {
  const at = locate(source, sceneIndex);
  const incoming = at?.alts[index];
  if (!at || !incoming) return source;

  const parked = at.alts.map(({ label, text }) => ({ label, text }));
  parked[index] = { label: outgoingLabel, text: at.active };
  return rebuild(source, sceneIndex, incoming.text, parked);
}

export function removeAlternative(source: string, sceneIndex: number, index: number): string {
  const at = locate(source, sceneIndex);
  if (!at || !at.alts[index]) return source;
  const parked = at.alts.filter((_, i) => i !== index).map(({ label, text }) => ({ label, text }));
  return rebuild(source, sceneIndex, at.active, parked);
}
