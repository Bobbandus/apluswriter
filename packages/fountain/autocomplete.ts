import { COMMON_EXTENSIONS, COMMON_TRANSITIONS, TIMES_OF_DAY } from './vocab';
import type { Script } from './types';

export type DictionaryKind = 'character' | 'location' | 'tag';

export interface DictionaryData {
  characters: string[];
  locations: string[];
  tags: string[];
}

export interface Suggestion {
  value: string;
  kind: DictionaryKind | 'time' | 'transition' | 'extension';
  /** Higher is better. Stable lexical ordering resolves ties. */
  score: number;
}

export const EMPTY_DICTIONARY: DictionaryData = { characters: [], locations: [], tags: [] };

/** Builds the immediately useful vocabulary a script teaches the editor. */
export function dictionaryFromScript(script: Pick<Script, 'characters' | 'locations' | 'scenes'>): DictionaryData {
  const tags = new Set<string>();
  for (const scene of script.scenes) {
    for (const tag of scene.meta.tags ?? []) tags.add(`${tag.kind} ${tag.value}`.trim());
  }

  return {
    characters: script.characters.map((entry) => entry.name),
    locations: script.locations.map((entry) => entry.name),
    tags: [...tags],
  };
}

export function mergeDictionary(...dictionaries: DictionaryData[]): DictionaryData {
  const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return {
    characters: unique(dictionaries.flatMap((dictionary) => dictionary.characters)),
    locations: unique(dictionaries.flatMap((dictionary) => dictionary.locations)),
    tags: unique(dictionaries.flatMap((dictionary) => dictionary.tags)),
  };
}

export function suggestionsFor(
  kind: Suggestion['kind'],
  query: string,
  dictionary: DictionaryData,
  recency: readonly string[] = [],
): Suggestion[] {
  const values =
    kind === 'character'
      ? dictionary.characters
      : kind === 'location'
        ? dictionary.locations
        : kind === 'tag'
          ? dictionary.tags
          : kind === 'time'
            ? TIMES_OF_DAY
            : kind === 'transition'
              ? COMMON_TRANSITIONS
              : COMMON_EXTENSIONS;
  const needle = query.trim().toLocaleUpperCase();

  return [...new Set(values)]
    .map((value) => {
      const haystack = value.toLocaleUpperCase();
      const starts = needle.length === 0 || haystack.startsWith(needle);
      const includes = needle.length > 0 && haystack.includes(needle);
      if (!starts && !includes) return null;
      const frequency = kind === 'character' ? dictionary.characters.filter((name) => name === value).length : 0;
      const recent = recency.indexOf(value);
      return {
        value,
        kind,
        score: (starts ? 1_000 : 500) + frequency * 10 + (recent < 0 ? 0 : 100 - recent),
      } satisfies Suggestion;
    })
    .filter((item): item is Suggestion => item !== null)
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
    .slice(0, 8);
}

/** The other half of a two-person exchange is the useful next cue. */
export function predictSpeaker(recentSpeakers: readonly string[], characters: readonly string[]): string | null {
  const last = recentSpeakers.at(-1);
  if (!last) return characters[0] ?? null;
  const other = [...recentSpeakers].reverse().find((speaker) => speaker !== last);
  return other ?? characters.find((character) => character !== last) ?? null;
}

/** Levenshtein is small and deterministic; a cue list is normally tiny. */
export function closestTypo(value: string, candidates: readonly string[], limit = 2): string | null {
  const needle = value.trim().toLocaleUpperCase();
  if (needle.length < 3) return null;
  let best: string | null = null;
  let bestDistance = limit + 1;
  for (const candidate of candidates) {
    if (candidate.toLocaleUpperCase() === needle) continue;
    const distance = editDistance(needle, candidate.toLocaleUpperCase());
    if (distance <= limit && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length] ?? 0;
}
