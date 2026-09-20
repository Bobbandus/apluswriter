'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { DimScope } from '@/components/editor/fountain/lockIn';

/**
 * How focus mode behaves. Several parts of the app read these (the editor, the
 * workspace, the palette), so they live in one small store instead of
 * in each part's own state.
 */
export interface FocusPrefs {
  /** What stays lit around the caret while in focus mode. */
  dim: DimScope;
  /** Keep the caret line at one height: only in focus mode, always, or never. */
  typewriter: 'focus' | 'always' | 'off';
  /** Open every script in focus mode. */
  startInFocus: boolean;
}

/** The window event that toggles focus mode from anywhere, such as the palette. */
export const TOGGLE_FOCUS_EVENT = 'aplus:toggle-focus';

export const DEFAULT_FOCUS_PREFS: FocusPrefs = { dim: 'paragraph', typewriter: 'focus', startInFocus: false };

const KEY = 'aplus.ui.focusPrefs';
const listeners = new Set<() => void>();

/** Reads whatever is stored, keeping only values that are valid. A bad entry falls back to the default. */
export function parseFocusPrefs(raw: string | null): FocusPrefs {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<FocusPrefs>) : {};
    return {
      dim: value.dim === 'scene' || value.dim === 'off' || value.dim === 'paragraph' ? value.dim : DEFAULT_FOCUS_PREFS.dim,
      typewriter:
        value.typewriter === 'always' || value.typewriter === 'off' || value.typewriter === 'focus'
          ? value.typewriter
          : DEFAULT_FOCUS_PREFS.typewriter,
      startInFocus: value.startInFocus === true,
    };
  } catch {
    return DEFAULT_FOCUS_PREFS;
  }
}

let cache: { raw: string | null; prefs: FocusPrefs } | null = null;

export function readFocusPrefs(): FocusPrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Blocked storage: the defaults stand.
  }
  // useSyncExternalStore needs the same object back while nothing changed.
  if (!cache || cache.raw !== raw) cache = { raw, prefs: parseFocusPrefs(raw) };
  return cache.prefs;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useFocusPrefs(): [FocusPrefs, (change: Partial<FocusPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, readFocusPrefs, () => DEFAULT_FOCUS_PREFS);
  const set = useCallback((change: Partial<FocusPrefs>) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...readFocusPrefs(), ...change }));
    } catch {
      // A preference that cannot be kept is not worth an error.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [prefs, set];
}
