'use client';

import { useEffect, useState } from 'react';

/** The current time in milliseconds, refreshed while `active`. Used to draw a running clock. */
export function useNow(active: boolean, everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs]);
  // While stopped the clock does not move, but the last value may be old, so read it fresh.
  return active ? now : Date.now();
}
