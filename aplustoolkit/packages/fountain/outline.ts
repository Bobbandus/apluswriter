import type { SceneIndexEntry, SectionEntry } from './types';

/**
 * The navigator's outline: acts, sequences and scenes as one ordered list.
 *
 * Sections and scenes are two separate indexes of the same document, so the
 * outline is what you get by laying them side by side in the order they
 * appear. Nothing here is stored — an act exists because someone typed
 * `# Akt II`, the same way a scene exists because someone typed a heading.
 */

export type OutlineRow =
  | {
      kind: 'section';
      /** Position in the sections index. Stable while typing elsewhere. */
      index: number;
      title: string;
      depth: number;
      from: number;
      collapsed: boolean;
      /** Scenes inside, nested sections included — what folding it away hides. */
      sceneCount: number;
    }
  | {
      kind: 'scene';
      /** Position in the scenes index, so callers can look up length and colour. */
      index: number;
      scene: SceneIndexEntry;
      /** How many section levels deep this scene sits. 0 with no sections. */
      indent: number;
    };

type Item =
  | { kind: 'section'; index: number; section: SectionEntry }
  | { kind: 'scene'; index: number; scene: SceneIndexEntry };

export function outlineRows(
  scenes: readonly SceneIndexEntry[],
  sections: readonly SectionEntry[],
  collapsed: ReadonlySet<number> = new Set(),
): OutlineRow[] {
  const items: Item[] = [
    ...sections.map((section, index) => ({ kind: 'section' as const, index, section })),
    ...scenes.map((scene, index) => ({ kind: 'scene' as const, index, scene })),
  ].sort((a, b) => start(a) - start(b));

  const rows: OutlineRow[] = [];

  /** Depth of the section a scene currently sits in. */
  let inside = 0;
  /** While set, everything is hidden until a section at or above this depth. */
  let hiddenBelow: number | null = null;

  items.forEach((item, position) => {
    if (item.kind === 'section') {
      const { depth } = item.section;
      if (hiddenBelow !== null && depth > hiddenBelow) return;
      hiddenBelow = null;
      inside = depth;

      const isCollapsed = collapsed.has(item.index);
      rows.push({
        kind: 'section',
        index: item.index,
        title: item.section.title,
        depth,
        from: item.section.from,
        collapsed: isCollapsed,
        sceneCount: countScenes(items, position, depth),
      });
      if (isCollapsed) hiddenBelow = depth;
      return;
    }

    if (hiddenBelow !== null) return;
    rows.push({ kind: 'scene', index: item.index, scene: item.scene, indent: inside });
  });

  return rows;
}

function start(item: Item): number {
  return item.kind === 'section' ? item.section.from : item.scene.from;
}

/** Scenes from just after `position` up to the next section at this depth or higher. */
function countScenes(items: readonly Item[], position: number, depth: number): number {
  let count = 0;
  for (let i = position + 1; i < items.length; i += 1) {
    const next = items[i] as Item;
    if (next.kind === 'section' && next.section.depth <= depth) break;
    if (next.kind === 'scene') count += 1;
  }
  return count;
}
