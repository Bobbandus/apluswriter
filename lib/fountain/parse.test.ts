import { describe, expect, it } from 'vitest';
import { parse, parseHeading, splitCharacter } from './parse';
import type { CharacterElement, Element, SceneHeadingElement } from './types';

/** The element types produced, in order — the quickest way to assert shape. */
const types = (source: string) => parse(source).elements.map((e) => e.type);

/** The first element of a given type. */
function first<T extends Element>(source: string, type: T['type']): T {
  const found = parse(source).elements.find((e) => e.type === type);
  if (!found) throw new Error(`no ${type} in: ${JSON.stringify(source)}`);
  return found as T;
}

/* ========================================================================== */

describe('scene headings', () => {
  it('recognises every spec prefix, in any case', () => {
    for (const heading of [
      'INT. HOUSE - DAY',
      'EXT. BRICKS POOL - DAY',
      'EST. FIELD - DAWN',
      'INT./EXT. CAR - NIGHT',
      'INT/EXT CAR - NIGHT',
      'I/E. CAR - NIGHT',
      "ext. brick's pool - day",
    ]) {
      expect(types(heading), heading).toEqual(['sceneHeading']);
    }
  });

  // Only the listed prefixes count. INTERIOR is a word, not a slugline.
  it('does not treat a word merely starting with a prefix as a heading', () => {
    expect(types('INTERIOR DESIGNERS ARRIVE')).toEqual(['action']);
    expect(types('ESTABLISHING A RAPPORT')).toEqual(['action']);
  });

  it('forces a heading with a leading period', () => {
    expect(types('.SNIPER SCOPE POV')).toEqual(['sceneHeading']);
    expect(first<SceneHeadingElement>('.SNIPER SCOPE POV', 'sceneHeading').text).toBe(
      'SNIPER SCOPE POV',
    );
  });

  // The spec calls this out specifically: `...` is an ellipsis.
  it('does not mistake an ellipsis for a forced heading', () => {
    expect(types('...and then it was over.')).toEqual(['action']);
  });

  it('reads a trailing scene number', () => {
    expect(parseHeading('INT. HOUSE - DAY #12A#')).toMatchObject({
      prefix: 'INT.',
      location: 'HOUSE',
      timeOfDay: 'DAY',
      sceneNumber: '12A',
    });
    expect(parseHeading('EXT. FIELD #I-1-A#').sceneNumber).toBe('I-1-A');
  });

  it('only splits off a time of day it recognises', () => {
    // Splitting blindly on the last dash would file this under "HOUSE" at a
    // time of day of "KITCHEN", and every location report would be wrong.
    expect(parseHeading('INT. HOUSE - KITCHEN')).toMatchObject({
      location: 'HOUSE - KITCHEN',
      timeOfDay: null,
    });
    expect(parseHeading('INT. HOUSE - KITCHEN - DAY')).toMatchObject({
      location: 'HOUSE - KITCHEN',
      timeOfDay: 'DAY',
    });
  });

  it('reads Swedish times of day', () => {
    expect(parseHeading('INT. MATSAL - DAG')).toMatchObject({
      location: 'MATSAL',
      timeOfDay: 'DAG',
    });
    expect(parseHeading('EXT. SKOLGÅRD – KVÄLL')).toMatchObject({
      location: 'SKOLGÅRD',
      timeOfDay: 'KVÄLL',
    });
    expect(parseHeading('INT. BIL - KONTINUERLIGT').timeOfDay).toBe('KONTINUERLIGT');
  });

  it('lifts the number out of a numbered Swedish heading', () => {
    expect(parseHeading('2. INT. MATSAL - DAG')).toMatchObject({
      sceneNumber: '2',
      prefix: 'INT.',
      location: 'MATSAL',
      timeOfDay: 'DAG',
    });
  });

  it('does not strip a leading number from something that is not a heading', () => {
    expect(types('2. Some numbered list item')).toEqual(['action']);
  });
});

/* ========================================================================== */

describe('characters and dialogue', () => {
  const block = 'STEEL\nBeer’s ready!';

  it('reads a cue followed by dialogue', () => {
    expect(types(block)).toEqual(['character', 'dialogue']);
    expect(first<CharacterElement>(block, 'character').name).toBe('STEEL');
  });

  // "…without an empty line after it" — this is what stops a shouted word in
  // its own paragraph from inventing a character.
  it('needs something after the cue in the same block', () => {
    expect(types('STEEL')).toEqual(['action']);
    expect(types('STEEL\n\nBeer is ready.')).toEqual(['action', 'action']);
  });

  it('requires at least one letter', () => {
    expect(types('R2D2\nBeep.')).toEqual(['character', 'dialogue']);
    expect(types('23\nBeep.')).toEqual(['action']);
  });

  it('forces mixed case with @', () => {
    const forced = parse('@McCLANE\nYippee ki-yay!');
    const cue = forced.elements[0] as CharacterElement;
    expect(cue.type).toBe('character');
    expect(cue.name).toBe('MCCLANE');
    expect(cue.text).toBe('McCLANE');
    expect(cue.forced).toBe(true);
  });

  it('keeps extensions out of the name and allows them in lower case', () => {
    expect(splitCharacter('STEEL (V.O.)')).toMatchObject({
      name: 'STEEL',
      extensions: ['(V.O.)'],
    });
    expect(splitCharacter('STEEL (on the radio)')).toMatchObject({
      name: 'STEEL',
      extensions: ['(on the radio)'],
    });
    expect(splitCharacter("BRICK (CONT'D)").extensions).toEqual(["(CONT'D)"]);
  });

  it('marks dual dialogue and ignores the spaces before the caret', () => {
    expect(splitCharacter('STEEL ^').dual).toBe(true);
    expect(splitCharacter('STEEL^')).toMatchObject({ name: 'STEEL', dual: true });
    expect(splitCharacter('STEEL    ^').name).toBe('STEEL');
  });

  it('reads a parenthetical between cue and dialogue', () => {
    expect(types('STEEL\n(beer raised)\nTo retirement.')).toEqual([
      'character',
      'parenthetical',
      'dialogue',
    ]);
  });

  it('keeps manual line breaks inside one dialogue element', () => {
    const script = parse('BRICK\nLine one.\nLine two.');
    expect(types('BRICK\nLine one.\nLine two.')).toEqual(['character', 'dialogue']);
    expect(script.elements[1]?.text).toBe('Line one.\nLine two.');
  });

  it('attributes dialogue to its speaker', () => {
    const script = parse('BRICK\nHello.\n\nSTEEL\nHi.');
    expect(script.elements.map((e) => ('character' in e ? e.character : e.type))).toEqual([
      'character',
      'BRICK',
      'character',
      'STEEL',
    ]);
  });
});

/* ========================================================================== */

describe('transitions', () => {
  it('recognises uppercase lines ending in TO:', () => {
    expect(types('CUT TO:')).toEqual(['transition']);
    expect(types('DISSOLVE TO:')).toEqual(['transition']);
  });

  it('forces one with >', () => {
    expect(types('> Burn to White.')).toEqual(['transition']);
    expect(first('> Burn to White.', 'transition').text).toBe('Burn to White.');
  });

  // The spec's own escape hatch: add a space after the colon.
  it('treats a trailing space after the colon as action', () => {
    expect(types('CUT TO: ')).toEqual(['action']);
  });

  it('prefers a scene heading when a period forces one', () => {
    expect(types('.CUT TO:')).toEqual(['sceneHeading']);
  });
});

/* ========================================================================== */

describe('other elements', () => {
  it('centres text bracketed with > and <', () => {
    expect(types('>THE END<')).toEqual(['centered']);
    expect(first('> THE END <', 'centered').text).toBe('THE END');
  });

  it('reads lyrics, which are always forced', () => {
    expect(types('~Willy Wonka! Willy Wonka!')).toEqual(['lyrics']);
    expect(first('~Willy Wonka!', 'lyrics').text).toBe('Willy Wonka!');
  });

  it('reads nested sections and synopses', () => {
    expect(types('# Act One')).toEqual(['section']);
    expect(parse('### Scene bits').elements[0]).toMatchObject({ type: 'section', depth: 3 });
    expect(types('= A short summary')).toEqual(['synopsis']);
    expect(first('= A short summary', 'synopsis').text).toBe('A short summary');
  });

  it('reads a page break', () => {
    expect(types('===')).toEqual(['pageBreak']);
    expect(types('=====')).toEqual(['pageBreak']);
  });

  it('forces action with !', () => {
    // Without the bang this uppercase line would become a cue.
    expect(types('!BRICK AND STEEL\nare still here.')).toEqual(['action']);
    expect(first('!THE WINDOW EXPLODES', 'action').text).toBe('THE WINDOW EXPLODES');
  });

  it('turns tabs into four spaces and keeps leading whitespace in action', () => {
    expect(first('\tIndented line', 'action').text).toBe('    Indented line');
  });

  it('keeps a standalone note as its own element', () => {
    expect(types('[[a thought]]')).toEqual(['note']);
  });
});

/* ========================================================================== */

describe('boneyard', () => {
  it('is the one construct that spans blank lines', () => {
    expect(types('/* cut\n\nthis */')).toEqual(['boneyard']);
  });

  it('runs to the end of the document when unterminated', () => {
    const script = parse('Action here.\n\n/* everything after this is gone');
    expect(script.elements.map((e) => e.type)).toEqual(['action', 'boneyard']);
  });

  it('leaves the text around it intact', () => {
    const script = parse('Before.\n\n/* gone */\n\nAfter.');
    expect(script.elements.map((e) => e.type)).toEqual(['action', 'boneyard', 'action']);
    expect(script.elements[0]?.text).toBe('Before.');
    expect(script.elements[2]?.text).toBe('After.');
  });
});

/* ========================================================================== */

describe('title page', () => {
  const source = [
    'Title:',
    '\t_**BRICK & STEEL**_',
    'Credit: Written by',
    'Author: Stu Maschwitz',
    'Draft date: 1/27/2012',
    '',
    'EXT. BRICKS PATIO - DAY',
  ].join('\n');

  it('reads inline and indented values', () => {
    const { titlePage } = parse(source);
    expect(titlePage?.fields.map((f) => f.key)).toEqual([
      'title',
      'credit',
      'author',
      'draft date',
    ]);
    expect(titlePage?.fields[0]?.values).toEqual(['_**BRICK & STEEL**_']);
    expect(titlePage?.fields[2]?.values).toEqual(['Stu Maschwitz']);
  });

  it('ends at the first blank line, and the body parses normally', () => {
    expect(parse(source).elements.map((e) => e.type)).toEqual(['sceneHeading']);
  });

  it('is only a title page at the very top', () => {
    // Mid-script this is dialogue, not a key/value pair.
    const script = parse('INT. ROOM - DAY\n\nBRICK\nTitle: not a title page');
    expect(script.titlePage).toBeNull();
    expect(script.elements.map((e) => e.type)).toEqual([
      'sceneHeading',
      'character',
      'dialogue',
    ]);
  });
});

/* ========================================================================== */

describe('Fountain+ extensions', () => {
  const source = [
    'INT. SKOLMATSAL - DAG [[id: s_8f2k]]',
    '[[CAST: Vilde, Noa-Li]]',
    '[[LOCATION: Skolmatsal. Statister i orange overaller.]]',
    '[[color: blue]]',
    '[[status: locked]]',
    '[[beat: Midpoint]]',
    '[[#prop Revolver]]',
    '[[#wardrobe Orange overall]]',
    '',
    'Vilde ställer sig upp.',
  ].join('\n');

  it('reads scene metadata from notes under the heading', () => {
    const heading = first<SceneHeadingElement>(source, 'sceneHeading');
    expect(heading.meta).toMatchObject({
      sceneId: 's_8f2k',
      cast: ['Vilde', 'Noa-Li'],
      locationNote: 'Skolmatsal. Statister i orange overaller.',
      color: 'blue',
      status: 'locked',
      beat: 'Midpoint',
    });
    expect(heading.meta.tags).toMatchObject([
      { kind: 'prop', value: 'Revolver' },
      { kind: 'wardrobe', value: 'Orange overall' },
    ]);
  });

  it('keeps the heading itself clean of the metadata', () => {
    const heading = first<SceneHeadingElement>(source, 'sceneHeading');
    expect(heading.location).toBe('SKOLMATSAL');
    expect(heading.timeOfDay).toBe('DAG');
  });

  it('leaves an unrecognised note as an ordinary note', () => {
    const script = parse('INT. ROOM - DAY\n[[remember to call the location scout]]');
    expect(script.elements[0]).toMatchObject({ type: 'sceneHeading' });
    expect((script.elements[0] as SceneHeadingElement).meta.sceneId).toBeUndefined();
  });

  it('collects to-dos wherever they appear', () => {
    const script = parse('INT. ROOM - DAY\n\nBRICK\nA line. [[todo: fix this line]]');
    expect(script.todos).toMatchObject([{ text: 'fix this line' }]);
  });
});

/* ========================================================================== */

describe('indexes', () => {
  const source = [
    'INT. KITCHEN - DAY',
    '',
    'BRICK',
    'Two words here.',
    '',
    'STEEL',
    '(dryly)',
    'Three more words now.',
    '',
    'EXT. KITCHEN - NIGHT',
    '',
    'BRICK',
    'Again.',
  ].join('\n');

  it('indexes scenes with their speakers', () => {
    const { scenes } = parse(source);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]?.speaking).toEqual(['BRICK', 'STEEL']);
    expect(scenes[1]?.speaking).toEqual(['BRICK']);
  });

  it('counts cues and words per character, excluding parentheticals', () => {
    const brick = parse(source).characters.find((c) => c.name === 'BRICK');
    const steel = parse(source).characters.find((c) => c.name === 'STEEL');
    expect(brick).toMatchObject({ cues: 2, words: 4 });
    // "(dryly)" is a performance note, not spoken words.
    expect(steel).toMatchObject({ cues: 1, words: 4 });
  });

  it('merges one location across its prefixes and times of day', () => {
    const { locations } = parse(source);
    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({
      name: 'KITCHEN',
      prefixes: ['INT.', 'EXT.'],
      timesOfDay: ['DAY', 'NIGHT'],
    });
  });

  it('attaches a synopsis to its scene', () => {
    const script = parse('INT. ROOM - DAY\n\n= They finally talk.\n\nAction.');
    expect(script.scenes[0]?.synopsis).toBe('They finally talk.');
  });
});
