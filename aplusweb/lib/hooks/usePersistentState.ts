'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * State backed by `localStorage`, for interface preferences only.
 *
 * Never use this for script content. Browser storage can be cleared, blocked
 * or unavailable in a private window, and it is per-device — the writer's
 * words go through the StorageAdapter, not through here.
 *
 * The first render always returns `initial` so the server and client markup
 * agree; the stored value is read on mount and applied after.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void, { hydrated: boolean }] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  // Avoid writing back the initial value before the stored one has been read.
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // Private mode, blocked site data, or corrupt JSON. The default stands.
    }
    loaded.current = true;
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked — a lost preference is not worth an error.
    }
  }, [key, value]);

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue(next);
  }, []);

  return [value, update, { hydrated }];
}
