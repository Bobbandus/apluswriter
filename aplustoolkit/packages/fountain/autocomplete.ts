import { parse } from './parse';
import { COMMON_EXTENSIONS, COMMON_TRANSITIONS, TIMES_OF_DAY } from './vocab';
import type { Script } from './types';

export type DictionaryKind = 'character' | 'location' | 'tag';

export interface DictionaryData {
  characters: string[];
  locations: string[];
  tags: string[];
  /**
   * How many cues each character has. The typo guard needs this to tell the
   * real name (many cues) from the slip (one cue) — without it, JONATAN and
   * JONATHAN are just two equally valid strings.
   */
  characterCues?: Record<string, number>;
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
    characterCues: Object.fromEntries(script.characters.map((entry) => [entry.name, entry.cues])),
  };
}

/* ========================================================================== */
/* What the script teaches the stored dictionary                              */
/* ========================================================================== */

/**
 * A word the script could teach the dictionary, and the line it was read from.
 *
 * The range is what makes the difference between a name and a keystroke on the
 * way to one. See `learnedFrom`.
 */
export interface LearnCandidate {
  value: string;
  kind: DictionaryKind;
  /** The source range the writer must have left before this counts. */
  from: number;
  to: number;
}

/**
 * The words a script is *ready* to teach, each with where it was written.
 *
 * Finished means finished in the script's own terms:
 *
 * - a **cue** once something is actually spoken under it — a name alone is a
 *   writer mid-thought, not a character;
 * - a **location** once its heading names a time of day, which is the point at
 *   which the heading is a heading rather than a prefix and a half-typed word;
 * - a **tag** always, because `[[#prop Revolver]]` does not parse as a tag
 *   until its brackets are closed.
 */
export function learnCandidates(script: Pick<Script, 'elements' | 'scenes'>): LearnCandidate[] {
  const candidates: LearnCandidate[] = [];

  for (let i = 0; i < script.elements.length; i += 1) {
    const element = script.elements[i];
    if (!element) continue;

    if (element.type === 'sceneHeading') {
      if (element.location && element.timeOfDay) {
        candidates.push({
          value: element.location.toLocaleUpperCase(),
          kind: 'location',
          from: element.from,
          to: element.to,
        });
      }
      continue;
    }

    if (element.type !== 'character') continue;

    // Walk the rest of the dialogue block: parentheticals are direction, so
    // only real spoken words finish the cue.
    let spoken = false;
    for (let j = i + 1; j < script.elements.length; j += 1) {
      const next = script.elements[j];
      if (next?.type === 'dialogue') {
        if (next.text.trim()) {
          spoken = true;
          break;
        }
        continue;
      }
      if (next?.type !== 'parenthetical') break;
    }

    if (spoken) {
      candidates.push({ value: element.name, kind: 'character', from: element.from, to: element.to });
    }
  }

  for (const scene of script.scenes) {
    for (const tag of scene.meta.tags ?? []) {
      candidates.push({ value: `${tag.kind} ${tag.value}`.trim(), kind: 'tag', from: tag.from, to: tag.to });
    }
  }

  return candidates;
}

/**
 * The candidates the writer has moved on from, as a dictionary.
 *
 * The caret is the whole point. Typing ERIK passes through E, ER and ERI, and
 * every one of those is a complete cue the moment a line of dialogue sits
 * under it. Remembering them would leave three ghosts in the dictionary that
 * outlive the script they came from — which is exactly what used to happen.
 * So nothing is learned from the line the writer is still on.
 *
 * Pass a caret of -1 to take the whole script, for "rebuild from the script".
 */
export function learnedFrom(candidates: readonly LearnCandidate[], caret: number): DictionaryData {
  const of = (kind: DictionaryKind) => [
    ...new Set(
      candidates
        .filter((candidate) => candidate.kind === kind && (caret < candidate.from || caret > candidate.to))
        .map((candidate) => candidate.value.trim())
        .filter(Boolean),
    ),
  ];

  return { characters: of('character'), locations: of('location'), tags: of('tag') };
}

/** Both halves at once, for the rebuild button and for tests. */
export function learnFromSource(source: string, caret = -1): DictionaryData {
  return learnedFrom(learnCandidates(parse(source)), caret);
}

/**
 * Stored vocabulary plus whatever is newly finished.
 *
 * Returns the stored dictionary unchanged when there is nothing new, so the
 * learning pass does not rewrite local storage on every keystroke.
 */
export function addLearned(stored: DictionaryData, learned: DictionaryData): DictionaryData {
  const add = (current: string[], found: string[]): string[] => {
    const have = new Set(current.map((value) => value.toLocaleUpperCase()));
    const fresh = found.filter((value) => !have.has(value.toLocaleUpperCase()));
    return fresh.length === 0 ? current : [...current, ...fresh];
  };

  const characters = add(stored.characters, learned.characters);
  const locations = add(stored.locations, learned.locations);
  const tags = add(stored.tags, learned.tags);

  if (characters === stored.characters && locations === stored.locations && tags === stored.tags) return stored;
  return { ...stored, characters, locations, tags };
}

export function mergeDictionary(...dictionaries: DictionaryData[]): DictionaryData {
  const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  // Cue counts describe the script as it is now, so the most recent
  // dictionary that carries them wins outright. Taking the maximum instead
  // would let a character who was renamed away keep looking established,
  // and the typo guard would keep steering new cues back to a dead name.
  const cues = [...dictionaries].reverse().find((dictionary) => dictionary.characterCues)?.characterCues ?? {};
  return {
    characters: unique(dictionaries.flatMap((dictionary) => dictionary.characters)),
    locations: unique(dictionaries.flatMap((dictionary) => dictionary.locations)),
    tags: unique(dictionaries.flatMap((dictionary) => dictionary.tags)),
    characterCues: cues,
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
      // The people who talk most are the ones most likely to be typed next.
      const frequency = kind === 'character' ? Math.min(50, dictionary.characterCues?.[value] ?? 0) : 0;
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


/**
 * The name a cue was probably meant to be, or null.
 *
 * Only flags a *rare* name that sits close to a *common* one: the cue has at
 * most one appearance and the neighbour has at least two. Two established
 * characters called ANNA and ANNE are left alone. That is a real cast, not a
 * typo, and a guard that nags about it gets switched off.
 */
export function likelyTypo(name: string, dictionary: DictionaryData): string | null {
  const needle = name.trim().toLocaleUpperCase();
  if (needle.length < 3) return null;

  const cues = dictionary.characterCues ?? {};
  if ((cues[needle] ?? 0) > 1) return null;

  const limit = needle.length >= 5 ? 2 : 1;
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of dictionary.characters) {
    const upper = candidate.toLocaleUpperCase();
    if (upper === needle) continue;
    if ((cues[upper] ?? cues[candidate] ?? 0) < 2) continue;

    const distance = editDistance(needle, upper);
    if (distance > limit) continue;

    // Prefer the closest name, then the most established one.
    const score = distance * 1000 - (cues[upper] ?? 0);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Known characters whose name starts with what has been typed, ignoring case.
 *
 * A writer types "er", not "ER". Matching case-insensitively is what makes
 * name completion usable at typing speed, before auto-uppercase has had a
 * chance to recognise the line as a cue.
 */
export function characterPrefixMatches(query: string, dictionary: DictionaryData): string[] {
  const needle = query.trim().toLocaleUpperCase();
  if (!needle) return [];
  const cues = dictionary.characterCues ?? {};
  return dictionary.characters
    .filter((name) => {
      const upper = name.toLocaleUpperCase();
      return upper.startsWith(needle) && upper !== needle;
    })
    .sort((a, b) => (cues[b] ?? 0) - (cues[a] ?? 0) || a.localeCompare(b));
}
