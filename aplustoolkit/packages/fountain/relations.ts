import type { CharacterEntry } from './types';

/**
 * Who shares scenes with whom.
 *
 * Built entirely from what the parser already knows — which scenes each
 * character speaks in — so it is a fact about the script, not an opinion about
 * it. Two characters are connected by as many lines as they have scenes in
 * common. Nothing here asks an AI anything.
 */

export interface RelationNode {
  name: string;
  words: number;
  cues: number;
}

export interface RelationEdge {
  a: string;
  b: string;
  /** Scenes both speak in. Always at least one: a pair with none has no edge. */
  scenes: number;
}

export interface Relations {
  nodes: RelationNode[];
  edges: RelationEdge[];
  /** Characters left out because there were more than `limit`. */
  omitted: number;
}

type Speaker = Pick<CharacterEntry, 'name' | 'cues' | 'words' | 'scenes'>;

/**
 * The map for the characters who carry the script.
 *
 * A picture of forty names is a hairball, so only the `limit` who speak the
 * most are drawn, and how many were left out is reported rather than hidden.
 */
export function relations(characters: readonly Speaker[], limit = 12): Relations {
  const ranked = [...characters].sort(
    (a, b) => b.words - a.words || b.cues - a.cues || a.name.localeCompare(b.name),
  );
  const kept = ranked.slice(0, limit);

  const edges: RelationEdge[] = [];
  for (let i = 0; i < kept.length; i += 1) {
    const first = kept[i] as Speaker;
    const inFirst = new Set(first.scenes);
    for (let j = i + 1; j < kept.length; j += 1) {
      const second = kept[j] as Speaker;
      let shared = 0;
      for (const scene of second.scenes) if (inFirst.has(scene)) shared += 1;
      if (shared > 0) edges.push({ a: first.name, b: second.name, scenes: shared });
    }
  }

  edges.sort((x, y) => y.scenes - x.scenes || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));

  return {
    nodes: kept.map(({ name, words, cues }) => ({ name, words, cues })),
    edges,
    omitted: Math.max(0, ranked.length - kept.length),
  };
}
