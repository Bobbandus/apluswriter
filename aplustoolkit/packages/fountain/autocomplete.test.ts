import { describe, expect, it } from 'vitest';
import {
  characterPrefixMatches,
  closestTypo,
  editDistance,
  likelyTypo,
  mergeDictionary,
  predictSpeaker,
  suggestionsFor,
} from './autocomplete';

describe('autocomplete vocabulary', () => {
  const dictionary = { characters: ['NOAH', 'VILDE', 'NOAH'], locations: ['HOUSE - KITCHEN'], tags: ['prop revolver'] };

  it('ranks a prefix above an infix match', () => {
    expect(suggestionsFor('character', 'no', dictionary)[0]?.value).toBe('NOAH');
  });

  it('predicts the other speaker in a two-person exchange', () => {
    expect(predictSpeaker(['NOAH', 'VILDE', 'NOAH'], dictionary.characters)).toBe('VILDE');
  });

  it('finds only close cue typos', () => {
    expect(closestTypo('JONATAN', ['JONATHAN'])).toBe('JONATHAN');
    expect(closestTypo('CAR', ['JONATHAN'])).toBeNull();
    expect(editDistance('KITCHEN', 'KITTEN')).toBe(2);
  });
});

describe('likelyTypo', () => {
  const dictionary = {
    characters: ['JONATHAN', 'ANNA', 'ANNE', 'JONATAN'],
    locations: [],
    tags: [],
    characterCues: { JONATHAN: 40, ANNA: 12, ANNE: 9, JONATAN: 1 },
  };

  it('steers a one-off name to the established character it is close to', () => {
    expect(likelyTypo('JONATAN', dictionary)).toBe('JONATHAN');
  });

  // Two real characters one letter apart are a cast, not a typo. A guard
  // that nags about that gets switched off, and then catches nothing.
  it('leaves two established characters alone', () => {
    expect(likelyTypo('ANNE', dictionary)).toBeNull();
    expect(likelyTypo('ANNA', dictionary)).toBeNull();
  });

  it('never flags the established name itself', () => {
    expect(likelyTypo('JONATHAN', dictionary)).toBeNull();
  });

  it('ignores names too short to judge', () => {
    expect(likelyTypo('AL', dictionary)).toBeNull();
  });
});

describe('characterPrefixMatches', () => {
  const dictionary = {
    characters: ['ERIK', 'ERIKA', 'EMMA'],
    locations: [],
    tags: [],
    characterCues: { ERIK: 3, ERIKA: 20, EMMA: 1 },
  };

  it('matches case-insensitively, most-spoken first', () => {
    expect(characterPrefixMatches('er', dictionary)).toEqual(['ERIKA', 'ERIK']);
  });

  it('does not offer what has already been typed in full', () => {
    expect(characterPrefixMatches('emma', dictionary)).toEqual([]);
  });
});

describe('mergeDictionary', () => {
  // The persisted dictionary remembers every name ever learned, but only the
  // open script knows who currently speaks. Its counts must win.
  it('takes cue counts from the live script, not the maximum ever seen', () => {
    const remembered = { characters: ['JONATHAN'], locations: [], tags: [], characterCues: { JONATHAN: 40 } };
    const live = { characters: ['JONAS'], locations: [], tags: [], characterCues: { JONAS: 40 } };
    expect(mergeDictionary(remembered, live).characterCues).toEqual({ JONAS: 40 });
  });
});
