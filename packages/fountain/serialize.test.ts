import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { serialize, serializeSides } from './serialize';
import { guessType, rewriteLine, stripForcing } from './rewrite';

const DIR = join(process.cwd(), 'fixtures', 'official');
const SAMPLES = [
  'Brick-And-Steel.fountain',
  'Big-Fish.fountain',
  'The-Last-Birthday-Card.fountain',
] as const;

/* ========================================================================== */

describe('round-trip', () => {
  /**
   * The invariant that matters.
   *
   * Byte equality is not the right goal — that would mean preserving every
   * stray trailing space, and no Fountain app does. What must hold is that
   * writing a file out and reading it back produces the same *script*: the
   * same elements, in the same order, saying the same things. If that ever
   * breaks, a writer loses work by pressing save twice.
   */
  describe.each(SAMPLES)('%s', (name) => {
    const source = readFileSync(join(DIR, name), 'utf8');
    const once = parse(source);
    const twice = parse(serialize(once));

    it('keeps every element, in order, with the same text', () => {
      expect(twice.elements.map((e) => e.type)).toEqual(once.elements.map((e) => e.type));
      expect(twice.elements.map((e) => e.raw)).toEqual(once.elements.map((e) => e.raw));
    });

    it('keeps the scene and character indexes identical', () => {
      expect(twice.scenes.map((s) => s.heading)).toEqual(once.scenes.map((s) => s.heading));
      expect(twice.characters.map((c) => `${c.name}:${c.cues}:${c.words}`)).toEqual(
        once.characters.map((c) => `${c.name}:${c.cues}:${c.words}`),
      );
    });

    it('keeps the title page', () => {
      expect(twice.titlePage?.fields.map((f) => `${f.key}=${f.values.join('|')}`)).toEqual(
        once.titlePage?.fields.map((f) => `${f.key}=${f.values.join('|')}`),
      );
    });

    it('is stable — a third pass changes nothing', () => {
      expect(serialize(twice)).toBe(serialize(once));
    });
  });

  it('keeps a cue, its parenthetical and its dialogue in one block', () => {
    // A blank line anywhere inside would split the block on the next parse,
    // turning the cue into action.
    const source = 'INT. ROOM - DAY\n\nBRICK\n(dryly)\nHello.\n';
    expect(serialize(parse(source))).toBe(source);
  });

  it('keeps metadata notes under their heading', () => {
    const source = 'INT. ROOM - DAY\n[[CAST: Vilde]]\n[[color: blue]]\n\nAction.\n';
    expect(serialize(parse(source))).toBe(source);
  });
});

/* ========================================================================== */

describe('sides', () => {
  const source = [
    'INT. KITCHEN - DAY',
    '',
    'BRICK',
    'Mine.',
    '',
    'INT. HALL - DAY',
    '',
    'STEEL',
    'Not mine.',
  ].join('\n');

  it('keeps only the scenes the character appears in', () => {
    const sides = serializeSides(parse(source), 'BRICK');
    expect(sides).toContain('INT. KITCHEN - DAY');
    expect(sides).not.toContain('INT. HALL - DAY');
  });

  // An actor needs the lines they come in on, so other characters stay.
  it('keeps other characters inside a kept scene', () => {
    const two = 'INT. KITCHEN - DAY\n\nBRICK\nMine.\n\nSTEEL\nCue line.';
    expect(serializeSides(parse(two), 'BRICK')).toContain('STEEL');
  });

  it('returns nothing for a character who never speaks', () => {
    expect(serializeSides(parse(source), 'NOBODY')).toBe('');
  });
});

/* ========================================================================== */

describe('stripForcing', () => {
  it('removes every forcing character', () => {
    expect(stripForcing('.SNIPER SCOPE POV')).toBe('SNIPER SCOPE POV');
    expect(stripForcing('!THE WINDOW EXPLODES')).toBe('THE WINDOW EXPLODES');
    expect(stripForcing('@McCLANE')).toBe('McCLANE');
    expect(stripForcing('> Burn to White.')).toBe('Burn to White.');
    expect(stripForcing('~Willy Wonka!')).toBe('Willy Wonka!');
    expect(stripForcing('### Scene bits')).toBe('Scene bits');
    expect(stripForcing('= A summary')).toBe('A summary');
    expect(stripForcing('(dryly)')).toBe('dryly');
    expect(stripForcing('>THE END<')).toBe('THE END');
  });

  it('leaves an ellipsis alone', () => {
    expect(stripForcing('...and then')).toBe('...and then');
  });
});

/* ========================================================================== */

describe('rewriteLine', () => {
  const roundTrips = (text: string, type: Parameters<typeof rewriteLine>[1]) =>
    guessType(rewriteLine(text, type));

  it('adds a forcing character only when the text needs one', () => {
    // Already reads as a slugline — a period here would be noise in the file.
    expect(rewriteLine('int. house - day', 'sceneHeading')).toBe('INT. HOUSE - DAY');
    // Does not — so it has to be forced.
    expect(rewriteLine('sniper scope pov', 'sceneHeading')).toBe('.SNIPER SCOPE POV');
  });

  it('uppercases a cue rather than forcing it', () => {
    expect(rewriteLine('brick', 'character')).toBe('BRICK');
    expect(rewriteLine('Brick (V.O.)', 'character')).toBe('BRICK (V.O.)');
  });

  it('forces a transition only when it does not end in TO:', () => {
    expect(rewriteLine('cut to:', 'transition')).toBe('CUT TO:');
    expect(rewriteLine('burn to white.', 'transition')).toBe('> burn to white.');
  });

  it('bangs action only when it would otherwise be misread', () => {
    expect(rewriteLine('He walks in.', 'action')).toBe('He walks in.');
    // This would be read as a cue without the bang.
    expect(rewriteLine('BRICK AND STEEL', 'action')).toBe('!BRICK AND STEEL');
    expect(rewriteLine('CUT TO:', 'action')).toBe('!CUT TO:');
  });

  it('wraps and marks the simple types', () => {
    expect(rewriteLine('dryly', 'parenthetical')).toBe('(dryly)');
    expect(rewriteLine('Act One', 'section')).toBe('# Act One');
    expect(rewriteLine('They talk', 'synopsis')).toBe('= They talk');
    expect(rewriteLine('la la', 'lyrics')).toBe('~la la');
    expect(rewriteLine('THE END', 'centered')).toBe('>THE END<');
    expect(rewriteLine('a thought', 'note')).toBe('[[a thought]]');
  });

  it('makes dialogue by stripping markup, since dialogue has none', () => {
    expect(rewriteLine('.A HEADING', 'dialogue')).toBe('A HEADING');
  });

  it('gives an empty line just its marker to type into', () => {
    expect(rewriteLine('', 'sceneHeading')).toBe('.');
    expect(rewriteLine('', 'parenthetical')).toBe('()');
    expect(rewriteLine('   ', 'section')).toBe('# ');
  });

  // The real test: whatever we write, the parser must read it back as asked.
  it('produces text the parser agrees with', () => {
    for (const text of ['hello there', 'BRICK', 'int. house - day', 'cut to:', '(dryly)']) {
      expect(roundTrips(text, 'sceneHeading'), text).toBe('sceneHeading');
      expect(roundTrips(text, 'transition'), text).toBe('transition');
      expect(roundTrips(text, 'section'), text).toBe('section');
      expect(roundTrips(text, 'synopsis'), text).toBe('synopsis');
      expect(roundTrips(text, 'parenthetical'), text).toBe('parenthetical');
      expect(roundTrips(text, 'action'), text).toBe('action');
    }
  });

  it('survives being switched back and forth', () => {
    let line = 'he walks in';
    line = rewriteLine(line, 'sceneHeading');
    line = rewriteLine(line, 'character');
    line = rewriteLine(line, 'action');
    expect(stripForcing(line).toLowerCase()).toBe('he walks in');
  });
});
