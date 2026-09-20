/**
 * Revisions: named snapshots of a script, and the quiet ones taken for it.
 *
 * Two kinds, deliberately kept apart:
 *
 * - **named** — the writer decided this draft mattered. It gets the next
 *   colour in the production sequence, the way a real production issues
 *   Blue pages, then Pink, then Yellow. Only these advance the colour.
 * - **auto** — taken quietly, so yesterday is never further away than a click.
 *   No colour, no name, and they are thinned out over time; a writer's history
 *   should not fill a disk.
 *
 * Everything here is pure. Storage and the clock belong to the caller.
 */

/** The industry sequence. Matches `create_revision` in supabase/03_functions.sql. */
export const REVISION_COLORS = [
  'white',
  'blue',
  'pink',
  'yellow',
  'green',
  'goldenrod',
  'buff',
  'salmon',
  'cherry',
] as const;

export type RevisionColor = (typeof REVISION_COLORS)[number];

export interface Revision {
  id: string;
  projectId: string;
  kind: 'named' | 'auto';
  /** What the writer called it. Empty for an automatic snapshot. */
  label: string;
  /** Null for an automatic snapshot: only issued drafts have a colour. */
  color: RevisionColor | null;
  /** The whole script as it stood. Text is the truth, so this is all there is. */
  content: string;
  /** Epoch ms. */
  createdAt: number;
}

/**
 * The colour the next named revision gets.
 *
 * Counted from named revisions only, and it wraps: a production that gets past
 * Cherry starts round again, which is what a real one does.
 */
export function nextColor(revisions: readonly Pick<Revision, 'kind'>[]): RevisionColor {
  const issued = revisions.filter((revision) => revision.kind === 'named').length;
  return REVISION_COLORS[issued % REVISION_COLORS.length] as RevisionColor;
}

export interface NewRevision {
  id: string;
  projectId: string;
  content: string;
  kind: Revision['kind'];
  /** Used for a named revision; falls back to the colour's name if left empty. */
  label?: string;
  now: number;
}

/** Builds a revision, deciding its colour from the history it joins. */
export function createRevision(input: NewRevision, existing: readonly Revision[]): Revision {
  if (input.kind === 'auto') {
    return {
      id: input.id,
      projectId: input.projectId,
      kind: 'auto',
      label: '',
      color: null,
      content: input.content,
      createdAt: input.now,
    };
  }

  const color = nextColor(existing);
  return {
    id: input.id,
    projectId: input.projectId,
    kind: 'named',
    label: input.label?.trim() || color,
    color,
    content: input.content,
    createdAt: input.now,
  };
}

/**
 * Is a snapshot worth taking?
 *
 * Not for an empty script, and not for one identical to the newest revision:
 * a writer who opens a script, reads it and closes it has not made a new
 * draft, and a history of forty identical copies is noise.
 */
export function worthSnapshotting(latest: Pick<Revision, 'content'> | undefined, content: string): boolean {
  if (!content.trim()) return false;
  return latest?.content !== content;
}

export interface PruneOptions {
  /** How many of the newest automatic snapshots are kept in full. */
  keepRecent?: number;
  /** Which calendar day a time falls on. Local by default: it is the writer's day. */
  dayOf?: (time: number) => string;
}

/**
 * Which automatic snapshots to delete.
 *
 * The newest `keepRecent` are all kept. Of the older ones, the newest of each
 * day survives, so the history thins out from "every ten minutes" to "one a
 * day" instead of stopping dead. Named revisions are never touched: those are
 * decisions the writer made.
 */
export function pruneAuto(revisions: readonly Revision[], options: PruneOptions = {}): string[] {
  const keepRecent = options.keepRecent ?? 20;
  const dayOf = options.dayOf ?? ((time: number) => new Date(time).toDateString());

  const auto = revisions.filter((revision) => revision.kind === 'auto').sort((a, b) => b.createdAt - a.createdAt);

  const older = auto.slice(keepRecent);
  const seenDays = new Set<string>();
  const doomed: string[] = [];

  for (const revision of older) {
    const day = dayOf(revision.createdAt);
    if (seenDays.has(day)) doomed.push(revision.id);
    else seenDays.add(day);
  }
  return doomed;
}
