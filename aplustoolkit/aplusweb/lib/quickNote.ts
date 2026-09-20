/**
 * A to-do left where the writer is, without leaving the page: `[[todo: …]]` at
 * the end of the line the caret is on. The end of the line, not the caret, so
 * a note never lands in the middle of a word or a cue.
 */
export function quickNoteEdit(text: string, caret: number, note: string): { from: number; to: number; insert: string } | null {
  // A `]]` inside would end the note early; a line break would end the element.
  const clean = note.replace(/\]\]/g, '] ]').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const at = Math.max(0, Math.min(caret, text.length));
  const end = text.indexOf('\n', at);
  const position = end === -1 ? text.length : end;
  const lineStart = text.lastIndexOf('\n', position - 1) + 1;
  // On an empty line there is nothing to trail, so the note stands alone.
  const spacer = position > lineStart ? ' ' : '';
  return { from: position, to: position, insert: `${spacer}[[todo: ${clean}]]` };
}
