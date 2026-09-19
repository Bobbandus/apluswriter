import { describe, expect, it } from 'vitest';
import { closestTypo, editDistance, predictSpeaker, suggestionsFor } from './autocomplete';

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
