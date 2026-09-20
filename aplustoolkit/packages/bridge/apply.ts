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
  | {
      ok: true;
      edits: TextEdit[];
      /**
       * Parts of a multi-part suggestion whose text could not be found any
       * more, by index. The rest still applies: losing nine good changes
       * because the tenth landed in a line the writer has since deleted
       * would be the wrong trade.
       */
      stale?: number[];
    }
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

/**
 * The edit that sets, or with `null` removes, one `[[key: value]]` under a scene heading.
 * `keys` lists the spellings that mean the same thing (`day`, `dag`): an existing note in
 * any of them is the one that changes, in the spelling the writer used.
 */
export function sceneNoteEdit(source: string, sceneIndex: number, keys: readonly string[], value: string | null): TextEdit | null {
  const script = parse(source);
  const scene = script.scenes[sceneIndex];
  if (!scene || keys.length === 0) return null;
  const { notes, end } = headingBlock(script, scene);
  const matching = (key: string) => new RegExp(`^\\[\\[\\s*${key}\\s*:`, 'i');
  const existing = notes.find((note) => keys.some((key) => matching(key).test(note.raw.trim())));
  const used = existing ? (keys.find((key) => matching(key).test(existing.raw.trim())) ?? keys[0]!) : keys[0]!;

  if (value === null) {
    if (!existing) return null;
    // Take the line break in front of the note with it, so no empty line is left behind.
    return { from: source[existing.from - 1] === '\n' ? existing.from - 1 : existing.from, to: existing.to, insert: '' };
  }
  const text = `[[${used}: ${value}]]`;
  return existing ? { from: existing.from, to: existing.to, insert: text } : { from: end, to: end, insert: `\n${text}` };
}

/**
 * @param selected Which parts of a multi-part suggestion to apply, by index.
 *   Omit for all of them; for `alternatives` the first entry is the option
 *   chosen, and omitting it takes the first.
 */
export function editsFor(source: string, suggestion: Suggestion, selected?: readonly number[]): ApplyResult {
  const script = parse(source);

  const sceneFor = (ref: SceneRef): SceneIndexEntry | null => resolveScene(script, ref);

  /** Where in the text to start looking for a suggestion's own words. */
  const hintFor = (ref: SceneRef | undefined): number => (ref ? (sceneFor(ref)?.from ?? 0) : 0);

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
      const pairs: [string[], string][] = [];
      if (suggestion.color) pairs.push([['color', 'colour', 'färg'], suggestion.color]);
      if (suggestion.status) pairs.push([['status'], suggestion.status]);
      if (suggestion.beat) pairs.push([['beat'], suggestion.beat]);
      if (suggestion.cast?.length) pairs.push([['CAST'], suggestion.cast.join(', ')]);
      if (suggestion.day) pairs.push([['day', 'dag'], String(suggestion.day)]);
      if (suggestion.energy) pairs.push([['energy', 'energi'], String(suggestion.energy)]);
      for (const [keys, value] of pairs) {
        const current = parse(text);
        const again = resolveScene(current, suggestion.scene);
        if (!again) return { ok: false, reason: 'sceneNotFound' };
        const edit = sceneNoteEdit(text, current.scenes.indexOf(again), keys, value);
        if (edit) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
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

    case 'rewrite': {
      const near = hintFor(suggestion.scene);
      const claimed: { from: number; to: number }[] = [];
      const edits: TextEdit[] = [];
      const stale: number[] = [];

      suggestion.hunks.forEach((hunk, index) => {
        if (selected && !selected.includes(index)) return;
        // Each change claims its own stretch of text. Two changes to the same
        // line — or to two lines that read identically — would otherwise both
        // resolve to the first match and corrupt each other.
        const at = nearestFree(source, hunk.before, near, claimed);
        if (at < 0) {
          stale.push(index);
          return;
        }
        const to = at + hunk.before.length;
        claimed.push({ from: at, to });
        edits.push({ from: at, to, insert: hunk.after });
      });

      if (edits.length === 0) return { ok: false, reason: 'stale' };
      return stale.length > 0 ? { ok: true, edits, stale } : { ok: true, edits };
    }

    case 'alternatives': {
      const choice = suggestion.options[selected?.[0] ?? 0];
      if (!choice) return { ok: false, reason: 'stale' };
      const at = nearest(source, suggestion.before, hintFor(suggestion.scene));
      if (at < 0) return { ok: false, reason: 'stale' };
      return { ok: true, edits: [{ from: at, to: at + suggestion.before.length, insert: choice.after }] };
    }

    case 'insert': {
      let at: number;
      if ('afterScene' in suggestion.anchor) {
        const scene = sceneFor(suggestion.anchor.afterScene);
        if (!scene) return { ok: false, reason: 'sceneNotFound' };
        // A scene runs to the start of the next one, which is where new
        // material belongs: after everything in it, before the next heading.
        at = scene.to;
      } else {
        const found = nearest(source, suggestion.anchor.after, 0);
        if (found < 0) return { ok: false, reason: 'stale' };
        at = found + suggestion.anchor.after.length;
      }
      return { ok: true, edits: [insertBlock(source, at, suggestion.text)] };
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

/**
 * Drops a block of Fountain in at an offset with the blank lines it needs.
 *
 * Fountain is whitespace-sensitive: a scene heading is only a heading with a
 * blank line after it, and a cue only a cue with one before it. Inserted text
 * that lands flush against its neighbours silently becomes action.
 */
function insertBlock(source: string, at: number, text: string): TextEdit {
  const body = text.replace(/^\n+/, '').replace(/\n+$/, '');
  const before = source.slice(0, at);
  const after = source.slice(at);

  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail = after === '' ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';

  return { from: at, to: at, insert: `${lead}${body}${tail}` };
}

/** The occurrence of `needle` closest to `near`, or -1. */
function nearest(haystack: string, needle: string, near: number): number {
  return nearestFree(haystack, needle, near, []);
}

/** The same, ignoring occurrences that overlap a range already spoken for. */
function nearestFree(
  haystack: string,
  needle: string,
  near: number,
  claimed: readonly { from: number; to: number }[],
): number {
  if (!needle) return -1;
  let best = -1;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    const to = at + needle.length;
    const free = !claimed.some((range) => at < range.to && to > range.from);
    if (free && (best < 0 || Math.abs(at - near) < Math.abs(best - near))) best = at;
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
