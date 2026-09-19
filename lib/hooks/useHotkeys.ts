'use client';

import { useEffect, useRef } from 'react';
import { detectPlatform } from '@/lib/platform/keys';

export type HotkeyHandler = (event: KeyboardEvent) => void;

/** `{ 'mod+k': open, 'mod+shift+f': focus }` — the same notation as `Kbd`. */
export type HotkeyMap = Record<string, HotkeyHandler>;

interface Parsed {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

function parse(binding: string): Parsed {
  const parts = binding
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const result: Parsed = { key: '', mod: false, shift: false, alt: false, ctrl: false };

  for (const part of parts) {
    switch (part) {
      case 'mod':
      case 'cmd':
      case 'meta':
        result.mod = true;
        break;
      case 'shift':
        result.shift = true;
        break;
      case 'alt':
      case 'opt':
        result.alt = true;
        break;
      case 'ctrl':
        result.ctrl = true;
        break;
      default:
        result.key = part;
    }
  }

  return result;
}

/**
 * Does this event target already own the keystroke?
 *
 * A bare letter must never steal focus from a text field, but a chord like
 * ⌘K is global by convention and fires anywhere.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Binds application shortcuts to the window.
 *
 * Handlers are held in a ref so callers can pass inline closures without
 * rebinding the listener on every render.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = detectPlatform() === 'mac';
      const modDown = isMac ? event.metaKey : event.ctrlKey;
      const pressed = event.key.toLowerCase();

      for (const [binding, handler] of Object.entries(mapRef.current)) {
        const want = parse(binding);

        if (want.key !== pressed) continue;
        if (want.mod !== modDown) continue;
        if (want.shift !== event.shiftKey) continue;
        if (want.alt !== event.altKey) continue;
        // On a Mac `mod` is ⌘, so a plain ⌃ chord is its own thing.
        if (isMac && want.ctrl !== event.ctrlKey) continue;

        // Unmodified keys stay out of the way of whatever is being typed.
        if (!want.mod && !want.alt && isTypingTarget(event.target)) continue;

        event.preventDefault();
        handler(event);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
