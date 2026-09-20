'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { detectPlatform } from '@/lib/platform/keys';

/**
 * The shortcuts a writer can change.
 *
 * Every action has a default; the writer's own choices are kept as a small map of
 * overrides, so a default that changes in a later version still reaches everyone
 * who never touched it.
 */
export const SHORTCUT_ACTIONS = [
  { id: 'palette', default: 'mod+k' },
  { id: 'focus', default: 'mod+shift+f' },
  { id: 'sidebar', default: 'mod+1' },
  { id: 'inspector', default: 'mod+2' },
  { id: 'settings', default: 'mod+,' },
  { id: 'export', default: 'mod+e' },
  { id: 'find', default: 'mod+f' },
  { id: 'replace', default: 'mod+h' },
  { id: 'quickNote', default: 'mod+shift+n' },
  { id: 'dual', default: 'mod+shift+d' },
  { id: 'sceneUp', default: 'mod+shift+arrowup' },
  { id: 'sceneDown', default: 'mod+shift+arrowdown' },
] as const;

export type ShortcutId = (typeof SHORTCUT_ACTIONS)[number]['id'];
export type ShortcutOverrides = Partial<Record<ShortcutId, string>>;

const KNOWN = new Set<string>(SHORTCUT_ACTIONS.map((action) => action.id));

/** Chords that already mean something in the browser or the editor, and must stay that way. */
const RESERVED = new Set([
  'mod+z', 'mod+shift+z', 'mod+y', 'mod+x', 'mod+c', 'mod+v', 'mod+a',
  'mod+w', 'mod+t', 'mod+n', 'mod+r', 'mod+q', 'mod+p', 'mod+s',
]);

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'altgraph', 'os']);

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * The chord a key event stands for, written the way `useHotkeys` reads it, or null
 * when it is not something that can be bound: a modifier on its own, or a bare key,
 * which would be taken from whatever the writer is typing.
 */
export function eventToBinding(event: KeyLike, isMac: boolean): string | null {
  const key = event.key.toLowerCase();
  if (MODIFIER_KEYS.has(key) || key === ' ' || key === '+' || key === 'escape' || key === 'dead') return null;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (!mod && !event.altKey) return null;
  return [mod ? 'mod' : '', isMac && event.ctrlKey ? 'ctrl' : '', event.altKey ? 'alt' : '', event.shiftKey ? 'shift' : '', key]
    .filter(Boolean)
    .join('+');
}

export const isReserved = (binding: string) => RESERVED.has(binding);

/** Only overrides for actions that exist and values that are text; anything else is dropped. */
export function parseOverrides(raw: string | null): ShortcutOverrides {
  try {
    const value = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: ShortcutOverrides = {};
    for (const [id, binding] of Object.entries(value)) {
      if (KNOWN.has(id) && typeof binding === 'string' && binding.length > 0) out[id as ShortcutId] = binding;
    }
    return out;
  } catch {
    return {};
  }
}

export function bindingFor(id: ShortcutId, overrides: ShortcutOverrides): string {
  return overrides[id] ?? SHORTCUT_ACTIONS.find((action) => action.id === id)!.default;
}

/** The other action that already uses this chord, if any. */
export function conflictOf(binding: string, id: ShortcutId, overrides: ShortcutOverrides): ShortcutId | null {
  return SHORTCUT_ACTIONS.find((action) => action.id !== id && bindingFor(action.id, overrides) === binding)?.id ?? null;
}

/* ---------------------------------------------------------------- the store */

const KEY = 'aplus.ui.shortcuts';
const listeners = new Set<() => void>();
let cache: { raw: string | null; overrides: ShortcutOverrides } | null = null;
const NONE: ShortcutOverrides = {};

export function readOverrides(): ShortcutOverrides {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Blocked storage: the defaults stand.
  }
  if (!cache || cache.raw !== raw) cache = { raw, overrides: parseOverrides(raw) };
  return cache.overrides;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export interface Shortcuts {
  /** What an action is bound to right now. */
  binding: (id: ShortcutId) => string;
  overrides: ShortcutOverrides;
  /** Binds an action, or with null puts its default back. Returns the action in the way, if there is one. */
  set: (id: ShortcutId, binding: string | null) => ShortcutId | 'reserved' | null;
  reset: () => void;
}

export function useShortcuts(): Shortcuts {
  const overrides = useSyncExternalStore(subscribe, readOverrides, () => NONE);

  const write = useCallback((next: ShortcutOverrides) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // A shortcut that cannot be kept is not worth an error.
    }
    listeners.forEach((listener) => listener());
  }, []);

  const set = useCallback(
    (id: ShortcutId, binding: string | null) => {
      const current = readOverrides();
      const next = { ...current };
      if (binding === null) {
        delete next[id];
      } else {
        if (isReserved(binding)) return 'reserved';
        const clash = conflictOf(binding, id, current);
        if (clash) return clash;
        next[id] = binding;
      }
      write(next);
      return null;
    },
    [write],
  );

  const reset = useCallback(() => write({}), [write]);
  const binding = useCallback((id: ShortcutId) => bindingFor(id, overrides), [overrides]);

  return { binding, overrides, set, reset };
}

const NAMES: Record<string, [mac: string, other: string]> = {
  mod: ['⌘', 'Ctrl'],
  ctrl: ['⌃', 'Ctrl'],
  alt: ['⌥', 'Alt'],
  shift: ['⇧', 'Shift'],
  arrowup: ['↑', '↑'],
  arrowdown: ['↓', '↓'],
  arrowleft: ['←', '←'],
  arrowright: ['→', '→'],
};

/** A chord as the platform shows it: ⌘⇧F on a Mac, Ctrl+Shift+F elsewhere. */
export function formatBinding(binding: string, mac: boolean = detectPlatform() === 'mac'): string {
  return binding
    .split('+')
    .map((part) => NAMES[part]?.[mac ? 0 : 1] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join(mac ? '' : '+');
}
