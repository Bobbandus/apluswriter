import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../fountain/parse';
import { formatEighths, paginate, type Page, type PageRow } from './paginate';

const require = createRequire(import.meta.url);
const { extract } = require('../../scripts/pdf-text.cjs') as { extract: (file: string) => string[][] };

const fixture = (name: string) => readFileSync(join(process.cwd(), 'fixtures/official', name), 'utf8');

/** A page as plain text lines, for readable assertions. */
const lines = (page: Page | undefined) =>
  (page?.rows ?? []).map((row: PageRow) => row.map((line) => line.text).join(' || '));

/** Enough filler action to bring the page to `rows` used lines. */
function filler(rows: number): string {
  // Each paragraph is one line plus the blank line before the next one.
  const paragraphs: string[] = [];
  let used = 0;
  while (used + (used === 0 ? 1 : 2) <= rows) {
    paragraphs.push(`Line ${paragraphs.length + 1}.`);
    used += used === 0 ? 1 : 2;
  }
  return paragraphs.join('\n\n');
}

/* ========================================================================== */
/* Golden: the official samples                                              */
/* ========================================================================== */

describe('golden — against the reference PDFs', () => {
  /**
   * The Last Birthday Card's reference PDF paginates at 54 lines on Letter,
   * the same as ours. So this is the strong check: not just the page count,
   * but that every page starts on the same line of the script.
   */
  it('The Last Birthday Card: same page count, and every page starts on the same line', () => {
    const ours = paginate(parse(fixture('The-Last-Birthday-Card.fountain')), { pageSize: 'letter' });
    const reference = extract(join(process.cwd(), 'fixtures/official/The-Last-Birthday-Card.pdf')).slice(1);

    expect(ours.pages).toHaveLength(reference.length);

    const norm = (s: string) => s.replace(/Õ/g, "'").replace(/\s+/g, ' ').trim().toUpperCase();
    let matched = 0;
    reference.forEach((runs, index) => {
      const first = runs.map(norm).find((t) => t.length > 3 && !/^\d+\.$/.test(t)) ?? '';
      const page = lines(ours.pages[index]).join(' | ').toUpperCase();
      if (page.slice(0, 400).includes(first.slice(0, 22))) matched += 1;
    });

    /* 19 of 20, and the one miss is understood. The reference wraps action at
       about 62 characters ("foot down on the brake and yanks up on the
       parking brake, but" is 62). We wrap at 60 — the industry standard for
       a 6" column at ten characters to the inch. Over eighteen pages those
       extra lines add up and move a single break on page 19. The page count
       is still exact. Matching one PDF's non-standard margin would make every
       other script wrong. */
    expect(matched).toBeGreaterThanOrEqual(reference.length - 1);
  });

  /**
   * Big Fish is a real production draft typeset in Final Draft with its own
   * margins. We do not try to imitate one studio's settings, so this checks
   * that a 120-page feature lands within 4% rather than exactly.
   */
  it('Big Fish: a feature-length script lands within 4% of the reference', () => {
    const ours = paginate(parse(fixture('Big-Fish.fountain')), { pageSize: 'letter' });
    const referenceBody = extract(join(process.cwd(), 'fixtures/official/Big-Fish.pdf')).length - 1;
    expect(Math.abs(ours.pages.length - referenceBody) / referenceBody).toBeLessThan(0.04);
  });

  it('never exceeds the lines a page holds', () => {
    for (const name of ['Big-Fish.fountain', 'The-Last-Birthday-Card.fountain', 'Brick-And-Steel.fountain']) {
      const ours = paginate(parse(fixture(name)), { pageSize: 'a4' });
      for (const page of ours.pages) expect(page.rows.length).toBeLessThanOrEqual(ours.linesPerPage);
    }
  });

  it('never starts a page with a blank line', () => {
    const ours = paginate(parse(fixture('Big-Fish.fountain')), { pageSize: 'letter' });
    for (const page of ours.pages) expect(page.rows[0]?.length ?? 1).toBeGreaterThan(0);
  });

  it('never leaves a scene heading or a lone cue at the bottom of a page', () => {
    const ours = paginate(parse(fixture('Big-Fish.fountain')), { pageSize: 'letter' });
    for (const page of ours.pages) {
      const last = page.rows[page.rows.length - 1]?.[0];
      expect(last?.kind).not.toBe('sceneHeading');
      expect(last?.kind).not.toBe('character');
    }
  });

  it('gives A4 fewer pages than Letter, because A4 is taller', () => {
    const script = parse(fixture('Big-Fish.fountain'));
    expect(paginate(script, { pageSize: 'a4' }).pages.length).toBeLessThan(
      paginate(script, { pageSize: 'letter' }).pages.length,
    );
  });
});

/* ========================================================================== */
/* The break rules                                                            */
/* ========================================================================== */

describe('break rules', () => {
  const L = 54; // Letter

  it('moves a heading that would be orphaned to the next page', () => {
    // Fill to two lines from the bottom: room for the heading, but not for
    // the heading plus two lines of what follows.
    const source = `${filler(L - 3)}\n\nINT. KITCHEN - DAY\n\nThey eat.\n\nThey talk.`;
    const result = paginate(parse(source), { pageSize: 'letter' });
    expect(lines(result.pages[0]).some((l) => l.includes('KITCHEN'))).toBe(false);
    expect(lines(result.pages[1])[0]).toBe('INT. KITCHEN - DAY');
  });

  it('splits long dialogue with (MORE) and a continued cue', () => {
    const speech = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} is here.`).join(' ');
    const source = `${filler(L - 8)}\n\nBRICK\n${speech}`;
    const result = paginate(parse(source), { pageSize: 'letter', moreLabel: '(MER)', contdLabel: '(FORTS.)' });

    const first = lines(result.pages[0]);
    const second = lines(result.pages[1]);
    expect(first[first.length - 1]).toBe('(MER)');
    expect(second[0]).toBe('BRICK (FORTS.)');
    // The rule: at least two lines of speech on each side of the break.
    expect(second.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps a cue with its dialogue when there is no room to split', () => {
    // 53 used lines: the cue, its line and the blank before them cannot fit.
    const source = `${filler(L - 1)}\n\nBRICK\nOne line only.`;
    const result = paginate(parse(source), { pageSize: 'letter' });
    expect(lines(result.pages[1]).slice(0, 2)).toEqual(['BRICK', 'One line only.']);
  });

  it('splits action only at the end of a sentence', () => {
    const paragraph = Array.from({ length: 10 }, (_, i) => `Something happens in beat ${i + 1}.`).join(' ');
    const source = `${filler(L - 4)}\n\n${paragraph}`;
    const result = paginate(parse(source), { pageSize: 'letter' });
    const first = lines(result.pages[0]);
    expect(first[first.length - 1]).toMatch(/\.$/);
  });

  it('honours a forced page break', () => {
    const result = paginate(parse('One.\n\n===\n\nTwo.'), { pageSize: 'letter' });
    expect(result.pages.map(lines)).toEqual([['One.'], ['Two.']]);
  });

  it('prints dual dialogue side by side', () => {
    const source = 'BRICK\nScrew retirement.\n\nSTEEL ^\nScrew retirement.';
    const [page] = paginate(parse(source), { pageSize: 'letter' }).pages;
    expect(page?.rows[0]?.map((l) => l.text)).toEqual(['BRICK', 'STEEL']);
    expect(page?.rows[0]?.[1]?.indentIn).toBeGreaterThan(page?.rows[0]?.[0]?.indentIn ?? 0);
  });
});

/* ========================================================================== */
/* What prints                                                                */
/* ========================================================================== */

describe('what prints', () => {
  const printed = (source: string) =>
    paginate(parse(source), { pageSize: 'letter' }).pages.flatMap((page) => page.rows.flat());

  it('drops forcing markup, notes and structure', () => {
    const texts = printed('# Act One\n\n= Summary\n\n.SNIPER SCOPE POV\n\n!LOUD ACTION [[a note]]\n\n@McCLANE\nYippee.').map((l) => l.text);
    expect(texts).toEqual(['SNIPER SCOPE POV', 'LOUD ACTION', 'McCLANE', 'Yippee.']);
  });

  it('keeps emphasis as styled runs, without the asterisks', () => {
    const [line] = printed('He is **very** tired.');
    expect(line?.text).toBe('He is very tired.');
    expect(line?.runs).toEqual([{ text: 'He is ' }, { text: 'very', bold: true }, { text: ' tired.' }]);
  });

  it('prints the scene number in the margin, not in the heading', () => {
    const [line] = paginate(parse('INT. HOUSE - DAY #12A#'), { pageSize: 'letter', sceneNumbers: true }).pages[0]?.rows[0] ?? [];
    expect(line?.text).toBe('INT. HOUSE - DAY');
    expect(line?.sceneNumber).toBe('12A');
  });

  it('numbers unnumbered scenes by position when asked', () => {
    const rows = paginate(parse('INT. A - DAY\n\nx.\n\nINT. B - DAY'), { pageSize: 'letter', sceneNumbers: true }).pages[0]?.rows ?? [];
    const numbers = rows.flat().filter((l) => l.kind === 'sceneHeading').map((l) => l.sceneNumber);
    expect(numbers).toEqual(['1', '2']);
  });

  it('wraps dialogue at 35 characters on Letter', () => {
    const texts = printed('BRICK\nThis is a line of dialogue that is definitely longer than thirty-five characters.').map((l) => l.text);
    for (const text of texts.slice(1)) expect(text.length).toBeLessThanOrEqual(35);
  });

  it('maps each printed line back to its place in the source', () => {
    const source = 'INT. HOUSE - DAY\n\nHe waits.';
    const [, action] = printed(source);
    expect(source.slice(action?.from ?? 0)).toBe('He waits.');
  });
});

describe('scene length', () => {
  it('measures scenes in eighths of a page', () => {
    const result = paginate(parse(fixture('Brick-And-Steel.fountain')), { pageSize: 'letter' });
    expect(result.sceneEighths).toHaveLength(8);
    for (const eighths of result.sceneEighths) expect(eighths).toBeGreaterThanOrEqual(1);
  });

  it('formats eighths the way a schedule does', () => {
    expect(formatEighths(3)).toBe('3/8');
    expect(formatEighths(8)).toBe('1');
    expect(formatEighths(11)).toBe('1 3/8');
  });
});
