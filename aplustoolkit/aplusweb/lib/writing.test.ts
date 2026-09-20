import { describe, expect, it } from 'vitest';
import { baselineFor, dayKey, formatElapsed, scriptWords, writtenSince } from './writing';

describe('scriptWords', () => {
  it('counts what is written, not the markup around it', () => {
    const source = [
      'Title: Min film',
      'Author: Vilde',
      '',
      '# Akt I',
      '',
      'INT. KÖK - DAG',
      '',
      '= Synopsis som inte räknas.',
      '',
      'Erik lagar mat. [[todo: inget av det här]]',
      '',
      '/* gammal scen som inte räknas */',
      '',
      'ERIK',
      'Hej på dig.',
    ].join('\n');
    // INT. KÖK - DAG (3: "-" is not a word) + Erik lagar mat. (3) + ERIK (1) + Hej på dig. (3)
    expect(scriptWords(source)).toBe(10);
  });

  it('is zero for an empty script, and does not treat a lone dash as a word', () => {
    expect(scriptWords('')).toBe(0);
    expect(scriptWords('- - -')).toBe(0);
  });

  it('counts å, ä and ö words', () => {
    expect(scriptWords('Vi åt äpplen och öl.')).toBe(5);
  });
});

describe('baseline', () => {
  it('keeps today’s baseline and starts a new one on a new day', () => {
    const stored = { day: '2026-09-20', words: 1000 };
    expect(baselineFor(stored, '2026-09-20', 1500)).toBe(stored);
    expect(baselineFor(stored, '2026-09-21', 1500)).toEqual({ day: '2026-09-21', words: 1500 });
    expect(baselineFor(null, '2026-09-21', 40)).toEqual({ day: '2026-09-21', words: 40 });
  });

  it('counts the difference, and never goes below zero', () => {
    expect(writtenSince({ words: 1000 }, 1412)).toBe(412);
    expect(writtenSince({ words: 1000 }, 700)).toBe(0);
  });
});

describe('time and day', () => {
  it('formats elapsed time', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(125_000)).toBe('2:05');
    expect(formatElapsed(3_727_000)).toBe('1:02:07');
    expect(formatElapsed(-5)).toBe('0:00');
  });

  it('uses the local calendar day', () => {
    expect(dayKey(new Date(2026, 8, 5, 23, 59))).toBe('2026-09-05');
    expect(dayKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});
