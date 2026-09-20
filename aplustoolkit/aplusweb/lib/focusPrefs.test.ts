import { describe, expect, it } from 'vitest';
import { DEFAULT_FOCUS_PREFS, parseFocusPrefs } from './focusPrefs';

describe('focus preferences', () => {
  it('falls back to the defaults on nothing, junk or a broken value', () => {
    expect(parseFocusPrefs(null)).toEqual(DEFAULT_FOCUS_PREFS);
    expect(parseFocusPrefs('{oj')).toEqual(DEFAULT_FOCUS_PREFS);
    expect(parseFocusPrefs('{"dim":"sideways","typewriter":3}')).toEqual(DEFAULT_FOCUS_PREFS);
  });

  it('keeps what is valid', () => {
    expect(parseFocusPrefs('{"dim":"scene","typewriter":"always","startInFocus":true}')).toEqual({ dim: 'scene', typewriter: 'always', startInFocus: true });
  });
});
