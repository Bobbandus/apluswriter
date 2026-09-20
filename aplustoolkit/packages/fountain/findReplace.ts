import type { Script } from './types';

/**
 * Find and replace over the script text, with a scope.
 *
 * Pure functions on the source string. The editor supplies the live text and
 * applies the edits this returns as one transaction, so "replace all" is a
 * single Ctrl+Z, like every other change the app makes.
 */

export type FindScope =
  | { kind: 'all' }
  /** The scene at this index of `script.scenes`. */
  | { kind: 'scene'; index: number }
  /** Only what this character says: dialogue and parentheticals, not their cue or the action. */
  | { kind: 'dialogue'; character: string };

export interface FindOptions {
  query: string;
  caseSensitive?: boolean;
  regex?: boolean;
  /** Only whole words. Ignored for a regular expression, which can say so itself. */
  wholeWord?: boolean;
}

export interface Match {
  from: number;
  to: number;
  text: string;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The pattern, or a message saying why there is none. An empty query is neither. */
export function compile(options: FindOptions): { pattern: RegExp | null; error?: string } {
  if (!options.query) return { pattern: null };
  const source = options.regex
    ? options.query
    : options.wholeWord
      ? `(?<![\\p{L}\\p{N}_])${escapeRegex(options.query)}(?![\\p{L}\\p{N}_])`
      : escapeRegex(options.query);
  try {
    return { pattern: new RegExp(source, `g${options.caseSensitive ? '' : 'i'}um`) };
  } catch (cause) {
    return { pattern: null, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

/** The stretches of the source a scope covers, in order. */
export function scopeRanges(script: Script, scope: FindScope): { from: number; to: number }[] {
  if (scope.kind === 'all') return [{ from: 0, to: script.source.length }];

  if (scope.kind === 'scene') {
    const scene = script.scenes[scope.index];
    return scene ? [{ from: scene.from, to: scene.to }] : [];
  }

  const name = scope.character.toUpperCase();
  return script.elements
    .filter((element) => (element.type === 'dialogue' || element.type === 'parenthetical') && element.character.toUpperCase() === name)
    .map((element) => ({ from: element.from, to: element.to }));
}

/**
 * Every match inside the scope, in order. A match is never allowed to cross
 * the edge of a range, so a search for "a b" cannot join the end of one
 * character's line to the start of another's.
 */
export function findMatches(script: Script, options: FindOptions, scope: FindScope = { kind: 'all' }): { matches: Match[]; error?: string } {
  const { pattern, error } = compile(options);
  if (!pattern) return { matches: [], ...(error ? { error } : {}) };

  const matches: Match[] = [];
  for (const range of scopeRanges(script, scope)) {
    const slice = script.source.slice(range.from, range.to);
    for (const found of slice.matchAll(pattern)) {
      if (found[0].length === 0) continue; // `a*` matching nothing is not a match
      const from = range.from + (found.index ?? 0);
      matches.push({ from, to: from + found[0].length, text: found[0] });
    }
  }
  return { matches };
}

/** What one match becomes: literal text, or with `$1`, `$&` expanded when searching by regex. */
export function replacementFor(match: Match, options: FindOptions, replacement: string): string {
  if (!options.regex) {
    // A character cue is written in capitals, and one that stops being capitals stops being
    // a cue. So a search that ignores case keeps a shouted match shouted: ERIK becomes OTTO.
    const letters = match.text.replace(/[^\p{L}]/gu, '');
    const shouted = !options.caseSensitive && letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
    return shouted ? replacement.toUpperCase() : replacement;
  }
  const { pattern } = compile(options);
  // Re-run on the matched text alone, so groups and `$&` mean what the writer expects.
  return pattern ? match.text.replace(new RegExp(pattern.source, pattern.flags.replace('g', '')), replacement) : replacement;
}

/** The edits that replace every match, as the editor applies them. */
export function replaceEdits(matches: readonly Match[], options: FindOptions, replacement: string): { from: number; to: number; insert: string }[] {
  return matches.map((match) => ({ from: match.from, to: match.to, insert: replacementFor(match, options, replacement) }));
}

/** The first match at or after `offset`, wrapping to the start; null when there are none. */
export function nextMatch(matches: readonly Match[], offset: number): Match | null {
  return matches.find((match) => match.from >= offset) ?? matches[0] ?? null;
}

/** The last match ending at or before `offset`, wrapping to the end. */
export function previousMatch(matches: readonly Match[], offset: number): Match | null {
  for (let i = matches.length - 1; i >= 0; i--) if (matches[i]!.to <= offset) return matches[i]!;
  return matches[matches.length - 1] ?? null;
}
