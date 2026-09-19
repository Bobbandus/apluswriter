import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { classifyLine, classifyRange, isBlankLine, type LineSource, type LineType } from './lineClassify';

const DIR = join(process.cwd(), 'fixtures', 'official');
const SAMPLES = [
  'Brick-And-Steel.fountain',
  'Big-Fish.fountain',
  'The-Last-Birthday-Card.fountain',
] as const;

/** A minimal stand-in for CodeMirror's Text, 1-based like the real thing. */
function docOf(source: string): LineSource {
  const lines = source.split('\n');
  return {
    lines: lines.length,
    line: (n: number) => ({ text: lines[n - 1] ?? '' }),
  };
}

/**
 * What the *parser* thinks each line is — the reference answer.
 *
 * Boneyard and title-page lines are excluded: the fast classifier is only ever
 * asked about ordinary body lines, because the editor handles those two as
 * whole regions.
 */
function parserLineTypes(source: string): Map<number, LineType> {
  const script = parse(source);
  const out = new Map<number, LineType>();

  for (const element of script.elements) {
    if (element.type === 'boneyard') continue;
    for (let line = element.lineStart; line <= element.lineEnd; line += 1) {
      // Convert the parser's 0-based lines to 1-based.
      out.set(line + 1, element.type);
    }
  }

  return out;
}

describe('agreement with the full parser', () => {
  /**
   * The load-bearing test for the editor's hot path.
   *
   * The fast classifier and the parser run the same state machine in two
   * places. If they ever disagree, the editor draws a line in one element's
   * position while the navigator files it under another — and the writer sees
   * dialogue indented like action with no error anywhere. This is what makes
   * that impossible to ship.
   */
  it.each(SAMPLES)('%s — every body line agrees', (name) => {
    const source = readFileSync(join(DIR, name), 'utf8');
    const doc = docOf(source);
    const expected = parserLineTypes(source);
    const actual = classifyRange(doc, 1, doc.lines);

    const disagreements: string[] = [];

    for (const [line, type] of expected) {
      const got = actual.get(line);
      if (got !== type) {
        disagreements.push(`line ${line}: parser=${type} classifier=${got} — ${JSON.stringify(doc.line(line).text.slice(0, 50))}`);
      }
    }

    expect(disagreements.slice(0, 10)).toEqual([]);
  });
});

describe('classifyRange', () => {
  const source = [
    'INT. KITCHEN - DAY', // 1
    '', // 2
    'BRICK', // 3
    '(dryly)', // 4
    'Hello there.', // 5
    'Still talking.', // 6
    '', // 7
    'He leaves.', // 8
  ].join('\n');
  const doc = docOf(source);

  it('classifies a whole document', () => {
    expect([...classifyRange(doc, 1, doc.lines).values()]).toEqual([
      'sceneHeading',
      'blank',
      'character',
      'parenthetical',
      'dialogue',
      'dialogue',
      'blank',
      'action',
    ]);
  });

  /**
   * The reason the classifier scans backwards at all.
   *
   * A viewport that opens at line 5 sees "Hello there." with no context. Read
   * on its own that is action, and it would be drawn at the action indent —
   * the dialogue would visibly jump left as the writer scrolled.
   */
  it('reads dialogue correctly when the range starts mid-block', () => {
    expect(classifyRange(doc, 5, 6).get(5)).toBe('dialogue');
    expect(classifyLine(doc, 6)).toBe('dialogue');
  });

  it('only scans back as far as the block start', () => {
    // Line 8 is its own block, so line 3's cue must not leak into it.
    expect(classifyLine(doc, 8)).toBe('action');
  });
});

describe('isBlankLine', () => {
  it('treats only a truly empty line as blank', () => {
    expect(isBlankLine('')).toBe(true);
    expect(isBlankLine('\r')).toBe(true);
    // Two spaces are Fountain's "this block continues" marker.
    expect(isBlankLine('  ')).toBe(false);
  });
});
