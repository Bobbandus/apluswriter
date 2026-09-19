import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { classifyLine, type LineType } from '@aplus/fountain/lineClassify';
import type { SwitchableType } from '@aplus/fountain/rewrite';

/* ========================================================================== */
/* Declared intent                                                            */
/* ========================================================================== */

/**
 * What the writer said this line is, when the text cannot say it yet.
 *
 * Fountain decides a cue by position: `BRICK` is a character only because a
 * line of dialogue follows it. So the instant a writer starts typing a name on
 * a fresh line, the document genuinely reads as Action — there is nothing
 * under it yet. Classification alone therefore cannot auto-uppercase a cue,
 * and cannot know that Enter should insert one newline rather than two.
 *
 * Pressing Tab, ⌘3, or picking from the element picker is the writer *saying*
 * what the line is. That declaration is held here until the caret leaves the
 * line, and it outranks classification while it lasts. It changes no text —
 * the document stays exactly what was typed.
 */
export const setIntent = StateEffect.define<{ line: number; type: SwitchableType } | null>();

export const intentField = StateField.define<{ line: number; type: SwitchableType } | null>({
  create: () => null,

  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setIntent)) return effect.value;
    }

    if (!value) return null;

    /* Undo has to take the declaration with it.
     *
     * Otherwise undoing a switch to Character restores the lower-case text
     * while the editor still believes the line is a cue — and the next
     * keystroke uppercases it straight back. From the writer's side that is
     * indistinguishable from undo being broken. */
    if (transaction.isUserEvent('undo') || transaction.isUserEvent('redo')) return null;

    // The declaration belongs to one line. Leaving it drops the intent.
    if (transaction.docChanged || transaction.selection) {
      const head = transaction.state.selection.main.head;
      if (transaction.state.doc.lineAt(head).number !== value.line) return null;
    }

    return value;
  },
});

/** What this line is, preferring the writer's declaration over inference. */
export function effectiveType(state: EditorState, lineNumber: number): LineType {
  const intent = state.field(intentField, false);
  if (intent && intent.line === lineNumber) return intent.type as LineType;
  return classifyLine(state.doc, lineNumber);
}

