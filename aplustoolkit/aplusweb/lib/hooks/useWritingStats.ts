'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { baselineFor, dayKey, scriptWords, writtenSince, type DayBaseline } from '@/lib/writing';

interface Pass {
  startedAt: number;
  words: number;
}

/**
 * Today's words and the current writing session for one script.
 *
 * Kept on this device (localStorage), like other interface state: it is a
 * convenience for the writer, not part of the project, and nothing else depends
 * on it. The word count is recounted a moment after typing stops, so it costs
 * nothing while the writer is writing.
 */
export function useWritingStats(projectId: string, source: string, ready: boolean) {
  const [enabled, setEnabled] = usePersistentState('aplus.writing.counter', false);
  const [stored, setStored, { hydrated }] = usePersistentState<DayBaseline | null>(`aplus.writing.day.${projectId}`, null);
  const [pass, setPass] = usePersistentState<Pass | null>(`aplus.writing.pass.${projectId}`, null);

  const [words, setWords] = useState<number | null>(null);
  useEffect(() => {
    if (!ready || !enabled) return;
    const timer = window.setTimeout(() => setWords(scriptWords(source)), 400);
    return () => window.clearTimeout(timer);
  }, [source, ready, enabled]);

  // The first count of the day is the baseline. Waiting for a real count matters: a baseline
  // taken before the script has loaded would be zero, and the whole script would count as today's.
  const today = dayKey(new Date());
  useEffect(() => {
    if (!hydrated || words === null) return;
    const next = baselineFor(stored, today, words);
    if (next !== stored) setStored(next);
  }, [hydrated, words, stored, today, setStored]);

  const writtenToday = useMemo(
    () => (words !== null && stored && stored.day === today ? writtenSince(stored, words) : null),
    [words, stored, today],
  );

  // A session counts the words itself, at the moment it starts and ends, so it works whether or
  // not the counter is showing, and never depends on a count that may not have run yet.
  const startPass = useCallback(() => setPass({ startedAt: Date.now(), words: scriptWords(source) }), [source, setPass]);

  /** Ends the pass and returns what it came to, or null if none was running. */
  const endPass = useCallback(() => {
    if (!pass) return null;
    setPass(null);
    return { minutes: Math.max(1, Math.round((Date.now() - pass.startedAt) / 60_000)), words: writtenSince(pass, scriptWords(source)) };
  }, [pass, source, setPass]);

  return {
    enabled,
    setEnabled,
    words,
    writtenToday,
    pass,
    passWords: pass && words !== null ? writtenSince(pass, words) : null,
    startPass,
    endPass,
  };
}
