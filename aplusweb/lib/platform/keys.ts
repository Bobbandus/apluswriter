/**
 * Keyboard shortcut formatting.
 *
 * Shortcuts are written once, platform-neutrally, as `mod+1` or `mod+shift+f`.
 * This module turns them into what the current platform actually shows —
 * ⌘⇧F on a Mac, Ctrl+Shift+F on Windows and Linux. Keeping the mapping here
 * is what lets the Electron build reuse the same shortcut table.
 */

export type Platform = 'mac' | 'win' | 'linux';

let cached: Platform | null = null;

export function detectPlatform(): Platform {
  if (cached) return cached;

  // Server render: assume Mac, since that is the design target. The client
  // re-renders with the real value on mount.
  if (typeof navigator === 'undefined') {
    return 'mac';
  }

  const source = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`.toLowerCase();

  cached = /mac|iphone|ipad|ipod/.test(source) ? 'mac' : /win/.test(source) ? 'win' : 'linux';

  return cached;
}

const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  cmd: '⌘',
  meta: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  opt: '⌥',
  shift: '⇧',
  enter: '↩',
  return: '↩',
  tab: '⇥',
  backtab: '⇤',
  esc: '⎋',
  escape: '⎋',
  backspace: '⌫',
  delete: '⌦',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  space: '␣',
};

const PC_NAMES: Record<string, string> = {
  mod: 'Ctrl',
  cmd: 'Ctrl',
  meta: 'Win',
  ctrl: 'Ctrl',
  alt: 'Alt',
  opt: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backtab: 'Shift+Tab',
  esc: 'Esc',
  escape: 'Esc',
  backspace: 'Backspace',
  delete: 'Del',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  space: 'Space',
};

/**
 * `formatShortcut('mod+shift+f')` → `'⌘⇧F'` on Mac, `'Ctrl+Shift+F'` elsewhere.
 *
 * Mac shortcuts concatenate with no separator, which is the platform
 * convention; everywhere else joins with `+`.
 */
export function formatShortcut(shortcut: string, platform: Platform = detectPlatform()): string {
  const isMac = platform === 'mac';
  const table = isMac ? MAC_SYMBOLS : PC_NAMES;

  const parts = shortcut
    .split('+')
    .map((raw) => raw.trim().toLowerCase())
    .filter(Boolean)
    .map((key) => table[key] ?? (key.length === 1 ? key.toUpperCase() : capitalize(key)));

  return isMac ? parts.join('') : parts.join('+');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** True when the event carries this platform's primary modifier. */
export function hasMod(event: KeyboardEvent | React.KeyboardEvent): boolean {
  return detectPlatform() === 'mac' ? event.metaKey : event.ctrlKey;
}
