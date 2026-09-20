import { describe, expect, it } from 'vitest';
import { SHORTCUT_ACTIONS, bindingFor, conflictOf, eventToBinding, isReserved, parseOverrides } from './shortcuts';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('shortcuts', () => {
  it('writes a key event as the chord the hotkey hook reads', () => {
    expect(eventToBinding(key('F', { ctrlKey: true, shiftKey: true }), false)).toBe('mod+shift+f');
    expect(eventToBinding(key('ArrowUp', { metaKey: true, shiftKey: true }), true)).toBe('mod+shift+arrowup');
    expect(eventToBinding(key('j', { altKey: true }), false)).toBe('alt+j');
  });

  it('refuses what cannot be a shortcut: a bare key, a lone modifier, space, escape', () => {
    expect(eventToBinding(key('j'), false)).toBeNull();
    expect(eventToBinding(key('Control', { ctrlKey: true }), false)).toBeNull();
    expect(eventToBinding(key(' ', { ctrlKey: true }), false)).toBeNull();
    expect(eventToBinding(key('Escape', { ctrlKey: true }), false)).toBeNull();
  });

  it('keeps the chords the browser and editor own out of reach', () => {
    expect(isReserved('mod+z')).toBe(true);
    expect(isReserved('mod+shift+d')).toBe(false);
  });

  it('gives every action a distinct default', () => {
    const defaults = SHORTCUT_ACTIONS.map((action) => action.default);
    expect(new Set(defaults).size).toBe(defaults.length);
  });

  it('uses the writer\'s choice and falls back to the default for the rest', () => {
    const overrides = parseOverrides('{"export":"mod+alt+e"}');
    expect(bindingFor('export', overrides)).toBe('mod+alt+e');
    expect(bindingFor('find', overrides)).toBe('mod+f');
  });

  it('ignores stored junk: unknown actions, non-text values, broken JSON', () => {
    expect(parseOverrides('{"nope":"mod+x","export":3}')).toEqual({});
    expect(parseOverrides('{oj')).toEqual({});
    expect(parseOverrides(null)).toEqual({});
  });

  it('finds the action that already has a chord, including one moved there by the writer', () => {
    expect(conflictOf('mod+f', 'export', {})).toBe('find');
    expect(conflictOf('mod+e', 'export', {})).toBeNull();
    expect(conflictOf('mod+alt+e', 'find', { export: 'mod+alt+e' })).toBe('export');
  });
});
