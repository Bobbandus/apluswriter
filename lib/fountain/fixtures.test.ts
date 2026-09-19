import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import type { CharacterElement, Script } from './types';

/**
 * The parser against the three official Fountain samples.
 *
 * Unit tests prove the rules were implemented; these prove they were
 * implemented *together*. Big Fish alone is 146 KB and 192 scenes of real
 * screenwriting, including all the things writers actually do that a spec
 * reading never suggests.
 *
 * The invariants at the bottom matter most. Every element carries absolute
 * offsets that CodeMirror decorations are hung from, so an off-by-one here
 * shows up as mangled formatting rather than as a parse error — which is
 * exactly the kind of bug that survives to production.
 */

const DIR = join(process.cwd(), 'fixtures', 'official');

function load(name: string): { source: string; script: Script } {
  const source = readFileSync(join(DIR, name), 'utf8');
  return { source, script: parse(source) };
}

const SAMPLES = [
  'Brick-And-Steel.fountain',
  'Big-Fish.fountain',
  'The-Last-Birthday-Card.fountain',
] as const;

/* ========================================================================== */

describe('Brick & Steel', () => {
  const { script } = load('Brick-And-Steel.fountain');

  it('reads the title page, including the indented multi-line values', () => {
    expect(script.titlePage?.fields.map((f) => f.key)).toEqual([
      'title',
      'credit',
      'author',
      'source',
      'draft date',
      'contact',
    ]);
    // Contact is three indented lines under one key.
    const contact = script.titlePage?.fields.find((f) => f.key === 'contact');
    expect(contact?.values).toHaveLength(3);
  });

  it('finds every scene and speaker', () => {
    expect(script.scenes).toHaveLength(8);
    expect(script.characters.map((c) => c.name)).toContain('STEEL');
    expect(script.characters.map((c) => c.name)).toContain('BRICK');
  });

  it('reads the dual dialogue cue', () => {
    const dual = script.elements.filter(
      (e): e is CharacterElement => e.type === 'character' && e.dual,
    );
    expect(dual).toHaveLength(1);
    // The caret sits on the second cue of the pair — the one that prints in
    // the right column. In this copy of the sample that is BRICK.
    expect(dual[0]?.name).toBe('BRICK');
  });

  it('finds transitions and centered text', () => {
    const counts = countTypes(script);
    expect(counts['transition']).toBeGreaterThan(0);
    expect(counts['centered']).toBeGreaterThan(0);
  });
});

/* ========================================================================== */

describe('Big Fish', () => {
  const { script } = load('Big-Fish.fountain');

  it('parses a full 146 KB feature', () => {
    expect(script.scenes).toHaveLength(192);
    expect(countTypes(script)['dialogue']).toBeGreaterThan(700);
  });

  it('ranks the lead correctly', () => {
    expect(script.characters[0]?.name).toBe('EDWARD');
    expect(script.characters[0]?.cues).toBeGreaterThan(250);
  });

  it('finds the page break after the epigraph', () => {
    expect(countTypes(script)['pageBreak']).toBe(1);
  });

  // A single uppercase line in its own block is Action, not a character —
  // "without an empty line after it". Shot descriptions like "A RIVER." are
  // exactly this case, and getting it wrong would invent 35 characters.
  it('does not mistake shot descriptions for characters', () => {
    expect(script.characters.map((c) => c.name)).not.toContain('A RIVER.');
    expect(script.characters.map((c) => c.name)).not.toContain('UNDER THE TABLE');
  });
});

/* ========================================================================== */

describe('The Last Birthday Card', () => {
  const { script } = load('The-Last-Birthday-Card.fountain');

  it('reads the outline structure', () => {
    const counts = countTypes(script);
    expect(counts['section']).toBe(28);
    expect(counts['synopsis']).toBe(7);
    expect(script.scenes).toHaveLength(48);
  });

  it('reads a forced transition', () => {
    const forced = script.elements.find((e) => e.type === 'transition' && e.text === 'HERE WE GO:');
    expect(forced).toBeDefined();
  });

  it('attaches synopses to the scenes they describe', () => {
    expect(script.scenes.some((s) => s.synopsis !== null)).toBe(true);
  });
});

/* ========================================================================== */

describe.each(SAMPLES)('invariants — %s', (name) => {
  const { source, script } = load(name);

  it('every element quotes its own source exactly', () => {
    for (const element of script.elements) {
      expect(source.slice(element.from, element.to)).toBe(element.raw);
    }
  });

  it('elements are ordered and never overlap', () => {
    let previous = -1;
    for (const element of script.elements) {
      expect(element.from).toBeGreaterThanOrEqual(previous);
      expect(element.to).toBeGreaterThanOrEqual(element.from);
      previous = element.to;
    }
  });

  it('every offset lands inside the document', () => {
    for (const element of script.elements) {
      expect(element.from).toBeGreaterThanOrEqual(0);
      expect(element.to).toBeLessThanOrEqual(source.length);
    }
  });

  // Decorations are placed from these, so a span that escapes its element
  // would style the wrong text rather than fail loudly.
  it('every inline span sits inside its element', () => {
    for (const element of script.elements) {
      for (const span of element.spans) {
        expect(span.from).toBeGreaterThanOrEqual(element.from);
        expect(span.to).toBeLessThanOrEqual(element.to);
        expect(span.contentFrom).toBeGreaterThanOrEqual(span.from);
        expect(span.contentTo).toBeLessThanOrEqual(span.to);
      }
    }
  });

  it('every indexed scene points at a real heading', () => {
    for (const scene of script.scenes) {
      expect(script.elements[scene.elementIndex]?.type).toBe('sceneHeading');
    }
  });

  it('every dialogue line is attributed to a character that exists', () => {
    const known = new Set(script.characters.map((c) => c.name));
    for (const element of script.elements) {
      if (element.type !== 'dialogue') continue;
      expect(known.has(element.character)).toBe(true);
    }
  });

  it('loses no text — every character is covered or is whitespace', () => {
    // Gaps between elements may only be blank space. Anything else means the
    // parser dropped part of the writer's script on the floor.
    //
    // The title page is the one region that produces no elements of its own —
    // it is held in `script.titlePage` instead — so the walk starts after it.
    let cursor = script.titlePage?.to ?? 0;

    for (const element of script.elements) {
      if (element.to <= cursor) continue;
      expect(source.slice(cursor, element.from).trim()).toBe('');
      cursor = element.to;
    }

    expect(source.slice(cursor).trim()).toBe('');
  });
});

function countTypes(script: Script): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const element of script.elements) {
    counts[element.type] = (counts[element.type] ?? 0) + 1;
  }
  return counts;
}
