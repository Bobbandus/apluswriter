import { describe, expect, it } from 'vitest';
import {
  CPI,
  LPI,
  charsPerLine,
  contentHeightIn,
  contentWidthIn,
  inToPt,
  linesPerPage,
} from './geometry';

/**
 * These numbers are the contract every other part of the app is built on. If
 * one of them moves, exported PDFs stop matching the screen and every runtime
 * estimate in the app is wrong — so they are pinned here deliberately, and a
 * failure means "was this intended?", not "update the expectation".
 */
describe('page geometry', () => {
  it('uses Courier 10-pitch metrics', () => {
    expect(CPI).toBe(10);
    expect(LPI).toBe(6);
  });

  describe('US Letter', () => {
    it('gives a 6 inch text block', () => {
      expect(contentWidthIn('letter')).toBeCloseTo(6, 5);
      expect(contentHeightIn('letter')).toBeCloseTo(9, 5);
    });

    it('fits 54 body lines', () => {
      expect(linesPerPage('letter')).toBe(54);
    });

    // The counts every screenwriting app agrees on.
    it('matches the industry character counts', () => {
      expect(charsPerLine('action', 'letter')).toBe(60);
      expect(charsPerLine('dialogue', 'letter')).toBe(35);
      expect(charsPerLine('parenthetical', 'letter')).toBe(20);
    });
  });

  describe('A4', () => {
    it('is taller, so it fits more lines', () => {
      expect(linesPerPage('a4')).toBe(58);
    });

    // A4 is ~0.23" narrower than Letter, which costs two characters of action
    // per line. Dialogue is unaffected: its width is fixed, not derived.
    it('is narrower, so action loses characters but dialogue does not', () => {
      expect(charsPerLine('action', 'a4')).toBe(57);
      expect(charsPerLine('dialogue', 'a4')).toBe(35);
    });
  });

  it('converts inches to PDF points', () => {
    expect(inToPt(1)).toBe(72);
    expect(inToPt(8.5)).toBe(612);
  });
});
