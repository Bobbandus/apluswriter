'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { detectPlatform } from '@/lib/platform/keys';
import { emptyHistory, record, redo as redoStep, undo as undoStep, type History } from '@/lib/history';

export interface Undoable<T> {
  /** Replaces the value and remembers the old one. Same `group` in a row is one step. */
  set: (next: T | ((previous: T) => T), group?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Undo and redo over a stored value (see `lib/history.ts`).
 *
 * Ctrl+Z / Ctrl+Shift+Z (⌘ on a Mac) are handled here, but never while focus
 * is in a text field: there the browser's own undo of the typing is the one
 * the writer means.
 */
export function useUndoable<T>(value: T, write: (next: T) => void, enabled = true): Undoable<T> {
  const history = useRef<History<T>>(emptyHistory<T>());
  const current = useRef(value);
  current.current = value;
  const [, bump] = useState(0);

  const set = useCallback(
    (next: T | ((previous: T) => T), group?: string) => {
      const previous = current.current;
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(previous) : next;
      if (resolved === previous) return;
      history.current = record(history.current, previous, group ?? null, Date.now());
      current.current = resolved;
      write(resolved);
      bump((n) => n + 1);
    },
    [write],
  );

  const undo = useCallback(() => {
    const step = undoStep(history.current, current.current);
    if (!step) return;
    history.current = step.history;
    current.current = step.value;
    write(step.value);
    bump((n) => n + 1);
  }, [write]);

  const redo = useCallback(() => {
    const step = redoStep(history.current, current.current);
    if (!step) return;
    history.current = step.history;
    current.current = step.value;
    write(step.value);
    bump((n) => n + 1);
  }, [write]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const mod = detectPlatform() === 'mac' ? event.metaKey : event.ctrlKey;
      if (!mod || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, undo, redo]);

  return {
    set,
    undo,
    redo,
    canUndo: history.current.past.length > 0,
    canRedo: history.current.future.length > 0,
  };
}
