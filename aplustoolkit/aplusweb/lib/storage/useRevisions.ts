'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createRevision, pruneAuto, worthSnapshotting, type Revision } from '@aplus/fountain/revisions';
import { localStore } from './local';

/**
 * How long the writer must stop before a quiet snapshot is taken.
 *
 * Long enough that it is a draft rather than a keystroke, short enough that
 * the worst a crash can cost is one thought — and the write-ahead cache in the
 * sync layer already covers the keystrokes between.
 */
export const AUTO_SNAPSHOT_IDLE_MS = 10 * 60 * 1000;

export interface UseRevisions {
  /** Newest first. */
  revisions: Revision[];
  /** The last draft the writer named, for the version pill. */
  latestNamed: Revision | undefined;
  /** Issue a draft: the next colour, and the label if one was given. */
  saveNamed: (label: string) => Promise<void>;
  /**
   * Keep the text as it is right now, unless it already is the newest
   * revision. Called before anything replaces the script, so no restore can
   * ever be the last copy of the words it overwrote.
   */
  guard: () => Promise<void>;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * A project's revisions, and the quiet snapshots taken for it.
 *
 * Snapshots are taken when the writer has been still for a while and when the
 * page is hidden or closed, and only when the script differs from the newest
 * revision. Opening a script to read it, or switching tabs and coming back,
 * leaves no trace.
 *
 * @param getText the live document; the hook never holds a copy of its own.
 * @param source  changes on every edit, and is only here to restart the idle timer.
 */
export function useRevisions(
  projectId: string,
  source: string,
  getText: () => string,
  ready: boolean,
  idleMs = AUTO_SNAPSHOT_IDLE_MS,
): UseRevisions {
  const [revisions, setRevisions] = useState<Revision[]>([]);

  const reload = useCallback(async () => {
    setRevisions(await localStore().listRevisions(projectId));
  }, [projectId]);

  useEffect(() => {
    if (ready) void reload();
  }, [ready, reload]);

  const take = useCallback(
    async (kind: 'named' | 'auto', label?: string) => {
      const content = getText();
      // Read fresh rather than trusting state: another tab may have added to it.
      const existing = await localStore().listRevisions(projectId);

      if (kind === 'auto' ? !worthSnapshotting(existing[0], content) : !content.trim()) return;

      const revision = createRevision(
        { id: newId(), projectId, content, kind, ...(label === undefined ? {} : { label }), now: Date.now() },
        existing,
      );
      await localStore().putRevision(revision);
      if (kind === 'auto') await localStore().deleteRevisions(pruneAuto([revision, ...existing]));
      await reload();
    },
    [getText, projectId, reload],
  );

  // Still for a while: a draft.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void take('auto'), idleMs);
    return () => window.clearTimeout(timer);
  }, [source, ready, idleMs, take]);

  // Leaving: whatever the writer was in the middle of.
  const takeRef = useRef(take);
  takeRef.current = take;
  useEffect(() => {
    if (!ready) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') void takeRef.current('auto');
    };
    const onLeave = () => void takeRef.current('auto');
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [ready]);

  return {
    revisions,
    latestNamed: revisions.find((revision) => revision.kind === 'named'),
    saveNamed: (label) => take('named', label),
    guard: () => take('auto'),
  };
}
