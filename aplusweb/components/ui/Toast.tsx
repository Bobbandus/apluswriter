'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import styles from './Toast.module.css';

/**
 * A brief message that leaves on its own.
 *
 * Returns the node to render and a function to show a message. Polite, not
 * assertive: a toast must never interrupt the writer or steal focus.
 */
export function useToast(duration = 3200): [ReactNode, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), duration);
    return () => window.clearTimeout(timer);
  }, [message, duration]);

  const show = useCallback((next: string) => setMessage(next), []);

  const node = message ? (
    <div className={styles.toast} role="status" aria-live="polite">
      {message}
    </div>
  ) : null;

  return [node, show];
}
