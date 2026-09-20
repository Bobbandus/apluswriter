import { parse } from './parse';

export interface DualEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * Turns dual dialogue on or off for the speech the caret is in.
 *
 * Dual dialogue is two speeches side by side, and Fountain marks the second one
 * with a `^` after its cue. So the toggle acts on that cue, and only when there
 * is a speech directly before it to sit beside: it will not mark the first
 * speech of a scene, which would print as a lone cue. Anything else returns
 * null, and the caller does nothing rather than guess.
 */
export function toggleDualEdit(source: string, caret: number): DualEdit | null {
  const elements = parse(source).elements.filter((element) => element.type !== 'boneyard' && element.type !== 'note');
  const at = elements.findIndex((element) => caret >= element.from && caret <= element.to);
  if (at < 0) return null;

  // Walk back to the cue this speech belongs to.
  let cue = at;
  while (cue >= 0 && (elements[cue]!.type === 'dialogue' || elements[cue]!.type === 'parenthetical')) cue--;
  const element = elements[cue];
  if (!element || element.type !== 'character' || cue > at) return null;

  if (element.dual) {
    const caretIndex = element.raw.lastIndexOf('^');
    if (caretIndex < 0) return null;
    const before = element.raw.slice(0, caretIndex).replace(/\s+$/, '');
    return { from: element.from + before.length, to: element.from + caretIndex + 1, insert: '' };
  }

  const previous = elements[cue - 1];
  if (!previous || (previous.type !== 'dialogue' && previous.type !== 'parenthetical')) return null;
  const end = element.from + element.raw.replace(/\s+$/, '').length;
  return { from: end, to: end, insert: ' ^' };
}
