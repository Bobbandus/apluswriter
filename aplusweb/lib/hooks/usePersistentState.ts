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

  /**
   * The key whose stored value has actually been read into `value`.
   *
   * This is state, not a ref, and that distinction is the whole fix for a
   * data-loss bug. With a ref, the write effect ran in the same commit as the
   * read — *before* React had re-rendered with the stored value — and saved
   * the empty initial value over it. In development, where React runs every
   * effect twice, the second read then picked up that empty string, and a
   * script vanished on reload. As state, "hydrated" only becomes true in the
   * same render that carries the stored value, so the first write can only
   * ever write back what was read.
   */
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const initialRef = useRef(initial);

  useEffect(() => {
    let next: T = initialRef.current;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) next = JSON.parse(raw) as T;
    } catch {
      // Private mode, blocked site data, or corrupt JSON. The default stands.
    }
    // A new key must never inherit the previous key's value — switching
    // project would otherwise copy one script into the other.
    setValue(next);
    setHydratedKey(key);
  }, [key]);

  useEffect(() => {
    if (hydratedKey !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked — a lost preference is not worth an error.
    }
  }, [key, value, hydratedKey]);

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue(next);
  }, []);

  return [value, update, { hydrated: hydratedKey === key }];
}
