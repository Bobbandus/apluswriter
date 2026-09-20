import { describe, expect, it } from 'vitest';
import {
  addLearned,
  characterPrefixMatches,
  closestTypo,
  editDistance,
  learnFromSource,
  likelyTypo,
  mergeDictionary,
  predictSpeaker,
  suggestionsFor,
  liveDictionary,
  type DictionaryData,
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

/* ========================================================================== */

describe('learning from the script', () => {
  const EMPTY: DictionaryData = { characters: [], locations: [], tags: [] };
  /** The caret sitting at the end of the cue line, where a writer types. */
  const endOfCue = (source: string) => source.length - '\nHej.'.length;

  describe('locations', () => {
    it('never learns a heading that has no time of day yet', () => {
      expect(learnFromSource('INT. E').locations).toEqual([]);
      expect(learnFromSource('INT. ERIKS RUM').locations).toEqual([]);
    });

    it('waits for the caret to leave a finished heading', () => {
      const source = 'INT. ERIKS RUM - DAG\n\nHan går in.';
      const onTheHeading = source.indexOf(' - DAG');
      expect(learnFromSource(source, onTheHeading).locations).toEqual([]);
      expect(learnFromSource(source, source.length).locations).toEqual(['ERIKS RUM']);
    });
  });

  describe('characters', () => {
    it('does not learn a cue with nothing spoken under it', () => {
      expect(learnFromSource('INT. KÖK - DAG\n\nERIK\n(tyst)').characters).toEqual([]);
    });

    it('learns a cue whose dialogue starts with a parenthetical', () => {
      const source = 'INT. KÖK - DAG\n\nERIK\n(tyst)\nHej.';
      expect(learnFromSource(source, source.length).characters).toEqual(['ERIK']);
    });

    // The bug this whole pass exists for. Every prefix of ERIK is a complete
    // cue the moment a line of dialogue sits under it, so the old rule
    // remembered E, ER and ERI for good — long after the script stopped
    // containing them.
    it('learns nothing from the letters on the way to a name', () => {
      for (const typed of ['E', 'ER', 'ERI', 'ERIK']) {
        const source = `INT. KÖK - DAG\n\n${typed}\nHej.`;
        expect(learnFromSource(source, endOfCue(source)).characters).toEqual([]);
      }
    });

    it('learns the name once the writer has moved on from it', () => {
      const source = 'INT. KÖK - DAG\n\nERIK\nHej.';
      expect(learnFromSource(source, source.length).characters).toEqual(['ERIK']);
    });
  });

  it('learns a tag once the caret has left it', () => {
    const source = 'INT. KÖK - DAG\n[[#prop Revolver]]\n\nHan går in.';
    expect(learnFromSource(source, source.indexOf('Revolver')).tags).toEqual([]);
    expect(learnFromSource(source, source.length).tags).toEqual(['prop Revolver']);
  });

  it('remembers only the finished name after a whole typing session', () => {
    let stored = EMPTY;
    for (const typed of ['E', 'ER', 'ERI', 'ERIK']) {
      const source = `INT. KÖK - DAG\n\n${typed}\nHej.`;
      stored = addLearned(stored, learnFromSource(source, endOfCue(source)));
    }
    // The writer backspaces to ERIK and carries on down the page.
    const done = 'INT. KÖK - DAG\n\nERIK\nHej.';
    stored = addLearned(stored, learnFromSource(done, done.length));

    expect(stored).toEqual({ characters: ['ERIK'], locations: ['KÖK'], tags: [] });
  });

  it('rebuilds the whole script when there is no caret', () => {
    const source = 'INT. KÖK - DAG\n\nERIK\nHej.\n\nEXT. GATA - NATT\n\nVILDE\nHej själv.';
    expect(learnFromSource(source)).toEqual({
      characters: ['ERIK', 'VILDE'],
      locations: ['KÖK', 'GATA'],
      tags: [],
    });
  });
});

describe('addLearned', () => {
  const stored: DictionaryData = { characters: ['ERIK'], locations: ['KÖK'], tags: [] };

  // Identity matters: the same object means React bails out of the render and
  // nothing is written to local storage, which is what keeps the learning
  // pass off the typing path.
  it('returns the stored dictionary itself when nothing is new', () => {
    expect(addLearned(stored, { characters: ['erik'], locations: ['KÖK'], tags: [] })).toBe(stored);
  });

  it('appends what is new and keeps what was learned before', () => {
    expect(addLearned(stored, { characters: ['VILDE'], locations: [], tags: ['prop Revolver'] })).toEqual({
      characters: ['ERIK', 'VILDE'],
      locations: ['KÖK'],
      tags: ['prop Revolver'],
    });
  });
});

describe('liveDictionary', () => {
  const stored = { characters: ['ERIK'], locations: ['KÖK'], tags: [] };
  const fromScript = { characters: ['ERIK', 'VILDE'], locations: ['KÖK', 'PLATS'], tags: [] };

  it('marks what only the script lists, and nothing the writer has saved', () => {
    const live = liveDictionary(stored, fromScript);
    expect(live.locations).toEqual(['KÖK', 'PLATS']);
    expect(live.scriptOnly).toEqual({ characters: ['VILDE'], locations: ['PLATS'] });
  });

  it('marks nothing when the stored dictionary already knows every one of them', () => {
    expect(liveDictionary({ characters: ['ERIK', 'VILDE'], locations: ['KÖK', 'PLATS'], tags: [] }, fromScript).scriptOnly).toEqual({ characters: [], locations: [] });
  });
});
