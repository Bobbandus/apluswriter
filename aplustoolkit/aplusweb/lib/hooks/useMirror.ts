'use client';

import { useCallback, useEffect, useState } from 'react';

interface MirrorBridge {
  mirrorFolder: () => Promise<string | null>;
  mirrorChoose: () => Promise<string | null>;
  mirrorClear: () => Promise<null>;
  mirrorWrite: (id: string, title: string, text: string) => Promise<string | null>;
}

const bridge = (): MirrorBridge | null => {
  if (typeof window === 'undefined') return null;
  const desktop = (window as unknown as { aplusDesktop?: Partial<MirrorBridge> }).aplusDesktop;
  return desktop?.mirrorWrite && desktop.mirrorFolder && desktop.mirrorChoose && desktop.mirrorClear ? (desktop as MirrorBridge) : null;
};

/**
 * Copies the open script to a `.fountain` file in a chosen folder (desktop only).
 *
 * One way: the app writes and never reads the file back. The copy is made a
 * moment after typing stops, and a failed copy is silent, since it must never
 * get in the way of writing. On the web there is no folder to write to, and
 * `available` is false, so nothing about it is shown.
 */
export function useMirror(projectId: string, title: string, source: string, ready: boolean) {
  const [available, setAvailable] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);

  useEffect(() => {
    const desktop = bridge();
    setAvailable(desktop !== null);
    if (desktop) void desktop.mirrorFolder().then(setFolder);
  }, []);

  useEffect(() => {
    const desktop = bridge();
    if (!desktop || !folder || !ready) return;
    const timer = window.setTimeout(() => void desktop.mirrorWrite(projectId, title, source), 1500);
    return () => window.clearTimeout(timer);
  }, [folder, ready, projectId, title, source]);

  const choose = useCallback(() => void bridge()?.mirrorChoose().then(setFolder), []);
  const clear = useCallback(() => void bridge()?.mirrorClear().then(() => setFolder(null)), []);

  return { available, folder, choose, clear };
}
