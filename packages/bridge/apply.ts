import { parse } from '../fountain/parse';
import type { Element, SceneIndexEntry, Script } from '../fountain/types';
import { onlyFormattingChanged, type SceneRef, type Suggestion } from './protocol';

/**
 * Turning an accepted suggestion into edits.
 *
 * Pure functions over the source text, so the app and the MCP server's file
 * mode apply a suggestion identically, and so it can be tested without either.
 * Every edit is anchored to something that is re-found in the current text —
 * the writer kept typing while Claude was thinking, and a suggestion made for
 * an older version must still land in the right place or not at all.
 */

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

export type ApplyResult =
  | { ok: true; edits: TextEdit[] }
  | { ok: false; reason: 'sceneNotFound' | 'stale' | 'notFormatting' };

const normalise = (heading: string) => heading.replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Finds the scene a suggestion was made for.
 *
 * The heading nearest the remembered position wins, so a scene inserted above
 * does not send a synopsis into the wrong scene, and two scenes that share a
 * heading are told apart by where they are.
 */
export function resolveScene(script: Script, ref: SceneRef): SceneIndexEntry | null {
  const wanted = normalise(ref.heading);
  let best: SceneIndexEntry | null = null;
  let distance = Number.POSITIVE_INFINITY;

  script.scenes.forEach((scene, index) => {
    if (normalise(scene.heading) !== wanted) return;
    const d = Math.abs(index - ref.index);
    if (d < distance) {
      best = scene;
      distance = d;
    }
  });

  return best;
}

/** The heading and the note lines stuck directly under it. */
function headingBlock(script: Script, scene: SceneIndexEntry): { heading: Element; notes: Element[]; end: number } {
  const heading = script.elements[scene.elementIndex] as Element;
  const notes: Element[] = [];
  let previousLine = heading.lineEnd;
  for (let i = scene.elementIndex + 1; i < script.elements.length; i += 1) {
    const element = script.elements[i] as Element;
    if (element.type !== 'note' || element.lineStart !== previousLine + 1) break;
    notes.push(element);
    previousLine = element.lineEnd;
  }
  const last = notes[notes.length - 1] ?? heading;
  return { heading, notes, end: last.to };
}

/** Sets `[[key: value]]` under a heading, replacing an existing one. */
function setNote(script: Script, scene: SceneIndexEntry, key: string, value: string): TextEdit {
  const { notes, end } = headingBlock(script, scene);
  const pattern = new RegExp(`^\\[\\[\\s*${key}\\s*:`, 'i');
  const existing = notes.find((note) => pattern.test(note.raw.trim()));
  const text = `[[${key}: ${value}]]`;
  return existing ? { from: existing.from, to: existing.to, insert: text } : { from: end, to: end, insert: `\n${text}` };
}

export function editsFor(source: string, suggestion: Suggestion): ApplyResult {
  const script = parse(source);

  const sceneFor = (ref: SceneRef): SceneIndexEntry | null => resolveScene(script, ref);

  switch (suggestion.kind) {
    case 'synopsis': {
      const scene = sceneFor(suggestion.scene);
      if (!scene) return { ok: false, reason: 'sceneNotFound' };
      const text = `= ${suggestion.text.replace(/\s+/g, ' ').trim()}`;
      const existing = script.elements.find((e) => e.type === 'synopsis' && e.from >= scene.from && e.to <= scene.to);
      if (existing) return { ok: true, edits: [{ from: existing.from, to: existing.to, insert: text }] };
      const { end } = headingBlock(script, scene);
      return { ok: true, edits: [{ from: end, to: end, insert: `\n\n${text}` }] };
    }

    case 'tags': {
      const scene = sceneFor(suggestion.scene);
      if (!scene) return { ok: false, reason: 'sceneNotFound' };
      const have = new Set((scene.meta.tags ?? []).map((t) => `${t.kind}:${t.value}`.toLowerCase()));
      const fresh = suggestion.tags.filter((t) => !have.has(`${t.kind}:${t.value}`.toLowerCase()));
      if (fresh.length === 0) return { ok: true, edits: [] };
      const { end } = headingBlock(script, scene);
      const insert = fresh.map((t) => `\n[[#${t.kind.toLowerCase().replace(/\s+/g, '-')} ${t.value.trim()}]]`).join('');
      return { ok: true, edits: [{ from: end, to: end, insert }] };
    }

    case 'metadata': {
      const scene = sceneFor(suggestion.scene);
      if (!scene) return { ok: false, reason: 'sceneNotFound' };
      // One key at a time, re-parsing between: each edit shifts the offsets
      // the next one needs.
      let text = source;
      const pairs: [string, string][] = [];
      if (suggestion.color) pairs.push(['color', suggestion.color]);
      if (suggestion.status) pairs.push(['status', suggestion.status]);
      if (suggestion.beat) pairs.push(['beat', suggestion.beat]);
      if (suggestion.cast?.length) pairs.push(['CAST', suggestion.cast.join(', ')]);
      for (const [key, value] of pairs) {
        const current = parse(text);
        const again = resolveScene(current, suggestion.scene);
        if (!again) return { ok: false, reason: 'sceneNotFound' };
        const edit = setNote(current, again, key, value);
        text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
      }
      return { ok: true, edits: diffToEdit(source, text) };
    }

    case 'note': {
      const body = suggestion.todo ? `[[todo: ${suggestion.text.trim()}]]` : `[[${suggestion.text.trim()}]]`;
      if (!suggestion.scene) {
        return { ok: true, edits: [{ from: source.length, to: source.length, insert: `${source.endsWith('\n') ? '' : '\n'}\n${body}\n` }] };
      }
      const scene = sceneFor(suggestion.scene);
      if (!scene) return { ok: false, reason: 'sceneNotFound' };
      const { end } = headingBlock(script, scene);
      return { ok: true, edits: [{ from: end, to: end, insert: `\n${body}` }] };
    }

    case 'format': {
      if (!onlyFormattingChanged(suggestion.before, suggestion.after)) return { ok: false, reason: 'notFormatting' };
      const at = nearest(source, suggestion.before, suggestion.near);
      if (at < 0) return { ok: false, reason: 'stale' };
      return { ok: true, edits: [{ from: at, to: at + suggestion.before.length, insert: suggestion.after }] };
    }

    // Production data, not script text: stored by the app, no edits here.
    case 'shotlist':
    case 'character':
    case 'document':
      return { ok: true, edits: [] };

    default:
      return { ok: false, reason: 'stale' };
  }
}

/** The occurrence of `needle` closest to `near`, or -1. */
function nearest(haystack: string, needle: string, near: number): number {
  if (!needle) return -1;
  let best = -1;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at;
    from = at + 1;
  }
  return best;
}

/** One edit covering exactly the span where two texts differ. */
export function diffToEdit(before: string, after: string): TextEdit[] {
  if (before === after) return [];
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let endA = before.length;
  let endB = after.length;
  while (endA > start && endB > start && before[endA - 1] === after[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  return [{ from: start, to: endA, insert: after.slice(start, endB) }];
}

/** Applies edits to a string (for tests and the MCP file mode). */
export function applyEdits(source: string, edits: TextEdit[]): string {
  return [...edits]
    .sort((a, b) => b.from - a.from)
    .reduce((text, edit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to), source);
}
