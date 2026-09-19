import {
  isCenteredLine,
  isCharacterLine,
  isParentheticalLine,
  isSceneHeadingLine,
  isTransitionLine,
  stripNotes,
} from './parse';
import { findNotes } from './inline';
import type { ElementType } from './types';

/**
 * Line-level classification, without parsing the document.
 *
 * The editor needs to know what every *visible* line is, on every keystroke,
 * to draw it in the right place. Running the full parser for that would cost
 * ~40ms on a feature-length script — ten times the budget — and almost all of
 * it would be spent on the 119 pages nobody is looking at.
 *
 * The saving grace is that Fountain is block-local: what a line is depends
 * only on the run of lines between the blank lines around it. So the editor
 * scans back to the start of the block, classifies forward, and stops. That is
 * O(block), not O(document), and a block is rarely more than a dozen lines.
 *
 * `lineClassify.test.ts` asserts this agrees with the full parser on every
 * line of all three official samples, so the two cannot drift apart.
 */

export type LineType = ElementType | 'blank';

/** A line is blank only if it is truly empty — two spaces mean "continue". */
export function isBlankLine(text: string): boolean {
  return text.replace(/\r$/, '').length === 0;
}

function isNoteOnly(trimmed: string): boolean {
  if (!trimmed.startsWith('[[')) return false;
  if (findNotes(trimmed).length === 0) return false;
  return stripNotes(trimmed).trim().length === 0;
}

/**
 * Classifies every line of one block.
 *
 * This is the same state machine the parser runs. It is kept separate rather
 * than shared because the parser also has to group lines into elements and
 * track offsets, and threading that through here would make the hot path pay
 * for work the editor does not need.
 */
export function blockLineTypes(lines: string[]): LineType[] {
  const out: LineType[] = [];
  let inDialogue = false;

  for (let i = 0; i < lines.length; i += 1) {
    const text = (lines[i] ?? '').replace(/\r$/, '');
    const trimmed = text.trim();
    const isLast = i === lines.length - 1;

    if (inDialogue) {
      out.push(isParentheticalLine(trimmed) ? 'parenthetical' : 'dialogue');
      continue;
    }

    if (trimmed.startsWith('!')) {
      out.push('action');
      continue;
    }

    if (/^={3,}\s*$/.test(trimmed)) {
      out.push('pageBreak');
      continue;
    }

    if (trimmed.startsWith('#')) {
      out.push('section');
      continue;
    }

    if (trimmed.startsWith('=')) {
      out.push('synopsis');
      continue;
    }

    if (trimmed.startsWith('~')) {
      out.push('lyrics');
      continue;
    }

    if (isCenteredLine(trimmed)) {
      out.push('centered');
      continue;
    }

    if (isNoteOnly(trimmed)) {
      out.push('note');
      continue;
    }

    if (isSceneHeadingLine(trimmed)) {
      out.push('sceneHeading');
      continue;
    }

    if (isTransitionLine(text)) {
      out.push('transition');
      continue;
    }

    // A cue needs something after it in the same block — "without an empty
    // line after it" — unless it was forced with `@`.
    if (isCharacterLine(trimmed) && (!isLast || trimmed.startsWith('@'))) {
      out.push('character');
      inDialogue = true;
      continue;
    }

    out.push('action');
  }

  return out;
}

/** The minimal document interface the classifier needs. */
export interface LineSource {
  /** 1-based, matching CodeMirror. */
  readonly lines: number;
  line(n: number): { text: string };
}

/**
 * Classifies a range of lines, scanning back only as far as the block start.
 *
 * `from` and `to` are 1-based and inclusive, matching CodeMirror's line
 * numbering so callers do not have to convert.
 */
export function classifyRange(doc: LineSource, from: number, to: number): Map<number, LineType> {
  const result = new Map<number, LineType>();

  let cursor = Math.max(1, from);

  // Walk back to the first line of the block `from` sits in. Without this a
  // viewport that starts mid-dialogue would read the dialogue as action.
  while (cursor > 1 && !isBlankLine(doc.line(cursor - 1).text)) cursor -= 1;

  while (cursor <= Math.min(to, doc.lines)) {
    if (isBlankLine(doc.line(cursor).text)) {
      result.set(cursor, 'blank');
      cursor += 1;
      continue;
    }

    const start = cursor;
    const lines: string[] = [];
    while (cursor <= doc.lines && !isBlankLine(doc.line(cursor).text)) {
      lines.push(doc.line(cursor).text);
      cursor += 1;
    }

    const types = blockLineTypes(lines);
    for (let i = 0; i < types.length; i += 1) {
      result.set(start + i, types[i] as LineType);
    }
  }

  return result;
}

/** What a single line is, given its document. Convenience for the keymap. */
export function classifyLine(doc: LineSource, line: number): LineType {
  return classifyRange(doc, line, line).get(line) ?? 'action';
}
