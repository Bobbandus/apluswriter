'use client';

import { useEffect, useState } from 'react';
import { detectPlatform, formatShortcut, type Platform } from '@/lib/platform/keys';
import styles from './Kbd.module.css';

export interface KbdProps {
  /** A platform-neutral shortcut, such as `mod+shift+f`. */
  shortcut: string;
  className?: string;
}

/**
 * Renders a keyboard shortcut in the current platform's notation.
 *
 * The first paint uses the Mac notation (the design target) and corrects
 * itself on mount, so the server and client markup agree.
 */
export function Kbd({ shortcut, className }: KbdProps) {
  const [platform, setPlatform] = useState<Platform>('mac');

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return (
    <kbd className={[styles.kbd, className].filter(Boolean).join(' ')}>
      {formatShortcut(shortcut, platform)}
    </kbd>
  );
}
