import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { elementFlow, enterCommand, intentField, switchElement, tabCommand } from './elementFlow';
import { history, redo, undo } from '@codemirror/commands';
import { DEFAULT_EDITOR_SETTINGS, editorSettings, type EditorSettings } from './settings';

/**
 * The element flow, tested as commands rather than through a DOM.
 *
 * These are `StateCommand`s, so they can be driven directly against an
 * `EditorState` with no browser involved. That makes the Enter/Tab behaviour —
 * the thing a writer touches thousands of times an hour — cheap enough to test
 * exhaustively.
 */

const settings = DEFAULT_EDITOR_SETTINGS;

function stateOf(doc: string, cursor = doc.length): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [elementFlow(), editorSettings.of(settings)],
  });
}

/** Runs a command and returns the resulting state. */
function apply(command: StateCommand, state: EditorState): EditorState {
  let next = state;
  const handled = command({
    state,
    dispatch: (transaction) => {
      next = transaction.state;
    },
  });
  expect(handled, 'command did not handle the key').toBe(true);
  return next;
}

const enter = (state: EditorState) => apply(enterCommand(), state);
const tab = (state: EditorState) => apply(tabCommand(false), state);

/* ========================================================================== */

describe('Enter', () => {
  /**
   * The whole element flow in one line of reasoning: Fountain decides element
   * type by blank lines, so "what does Enter do" is entirely "how many
   * newlines does it insert".
   */
  it('ends a scene heading with a blank line', () => {
    expect(enter(stateOf('INT. KITCHEN - DAY')).doc.toString()).toBe('INT. KITCHEN - DAY\n\n');
  });

  it('ends an action paragraph with a blank line', () => {
    expect(enter(stateOf('He walks in.')).doc.toString()).toBe('He walks in.\n\n');
  });

  // Dialogue has to touch its cue — a blank line here would turn the cue into
  // action and the speech into a new paragraph.
  it('keeps dialogue attached to its cue', () => {
    // Caret at the end of a cue that already has dialogue under it.
    const state = stateOf('INT. ROOM - DAY\n\nBRICK\nHello.', 22);
    expect(enter(state).doc.toString()).toBe('INT. ROOM - DAY\n\nBRICK\n\nHello.');
  });

  it('keeps dialogue attached after a parenthetical', () => {
    const state = stateOf('BRICK\n(dryly)');
    expect(enter(state).doc.toString()).toBe('BRICK\n(dryly)\n');
  });

  it('ends a speech after dialogue', () => {
    const state = stateOf('BRICK\nBeer is ready.');
    expect(enter(state).doc.toString()).toBe('BRICK\nBeer is ready.\n\n');
  });

  it('leaves the caret at the end of what it inserted', () => {
    const next = enter(stateOf('He walks in.'));
    expect(next.selection.main.head).toBe(next.doc.length);
  });

  it('respects a declared element even when the text cannot show it yet', () => {
    // Tab declares a cue on an empty line. Nothing follows it, so the text
    // alone still reads as action — the declaration is what makes Enter
    // insert one newline instead of two.
    const declared = tab(stateOf('INT. ROOM - DAY\n\n'));
    const typed = declared.update({
      changes: { from: declared.doc.length, insert: 'BRICK' },
      selection: EditorSelection.cursor(declared.doc.length + 5),
    }).state;

    expect(enter(typed).doc.toString()).toBe('INT. ROOM - DAY\n\nBRICK\n');
  });
});

/* ========================================================================== */

describe("(CONT'D)", () => {
  /**
   * Reproduces the path a writer actually takes: Tab declares a cue on an
   * empty line, they type the name, they press Enter.
   *
   * Until that Enter there is nothing underneath the name, so on the text
   * alone the line genuinely reads as Action — which is precisely why the
   * declaration has to carry the intent through.
   */
  function typeCueAndEnter(before: string, name: string, flow = settings): string {
    const declared = apply(
      tabCommand(false),
      EditorState.create({
        doc: `${before}\n\n`,
        selection: EditorSelection.cursor(before.length + 2),
        extensions: [elementFlow(), editorSettings.of(flow)],
      }),
    );

    const typed = declared.update({
      changes: { from: declared.doc.length, insert: name },
      selection: EditorSelection.cursor(declared.doc.length + name.length),
    }).state;

    return apply(enterCommand(), typed).doc.toString();
  }

  it('marks a cue that repeats after only action', () => {
    const before = ['INT. ROOM - DAY', '', 'BRICK', 'First line.', '', 'He turns away.'].join('\n');
    expect(typeCueAndEnter(before, 'BRICK')).toContain('BRICK (FORTS.)');
  });

  // Interrupted by another character, this is a new speech, not a continued
  // one — marking it would be wrong.
  it('does not mark a cue interrupted by another character', () => {
    const before = ['INT. ROOM - DAY', '', 'BRICK', 'First.', '', 'STEEL', 'Second.'].join('\n');
    expect(typeCueAndEnter(before, 'BRICK')).not.toContain('FORTS');
  });

  it('does not carry across a scene heading', () => {
    const before = ['INT. ROOM - DAY', '', 'BRICK', 'First.', '', 'EXT. STREET - DAY'].join('\n');
    expect(typeCueAndEnter(before, 'BRICK')).not.toContain('FORTS');
  });

  it('does not add a second marker', () => {
    const before = ['INT. ROOM - DAY', '', 'BRICK', 'First.', '', 'He turns.'].join('\n');
    expect(typeCueAndEnter(before, 'BRICK (FORTS.)').match(/FORTS/g)).toHaveLength(1);
  });

  it('uses the English marker in English', () => {
    const english: EditorSettings = { ...DEFAULT_EDITOR_SETTINGS, locale: 'en' };
    const before = ['INT. ROOM - DAY', '', 'BRICK', 'First.', '', 'He turns.'].join('\n');
    expect(typeCueAndEnter(before, 'BRICK', english)).toContain("BRICK (CONT'D)");
  });
});

/* ========================================================================== */

describe('Tab', () => {
  it('turns an empty line into a cue', () => {
    const next = tab(stateOf('INT. ROOM - DAY\n\n'));
    // No text yet, so nothing visible changes — but the declaration is made,
    // which is what the Enter test above depends on.
    expect(next.doc.toString()).toBe('INT. ROOM - DAY\n\n');
  });

  it('completes a bare scene prefix', () => {
    expect(tab(stateOf('INT')).doc.toString()).toBe('INT. ');
    expect(tab(stateOf('EXT')).doc.toString()).toBe('EXT. ');
  });

  it('offers the time-of-day separator once there is a location', () => {
    expect(tab(stateOf('INT. KITCHEN')).doc.toString()).toBe('INT. KITCHEN - ');
  });

  it('adds a parenthetical under a cue', () => {
    // Caret at the end of a cue that already has dialogue under it.
    const state = stateOf('INT. ROOM - DAY\n\nBRICK\nHi.', 22);
    expect(tab(state).doc.toString()).toBe('INT. ROOM - DAY\n\nBRICK\n()\nHi.');
  });

  /**
   * Switching to a cue uppercases the text, and that is not reversible — the
   * original casing is gone. So stepping back lands on Action wearing a `!`,
   * which is correct rather than unfortunate: `HELLO` without one would be
   * read straight back as a cue.
   */
  it('steps backwards with Shift+Tab', () => {
    const forward = apply(tabCommand(false), stateOf('hello'));
    expect(forward.doc.toString()).toBe('HELLO');
    expect(apply(tabCommand(true), forward).doc.toString()).toBe('!HELLO');
  });
});

/* ========================================================================== */

describe('undo', () => {
  /**
   * The reported bug: type `Noah`, press Tab to make it a cue, press Ctrl+Z —
   * and it came back in capitals.
   *
   * Two causes, both fixed. CodeMirror's history merges edits that arrive
   * close together, so the typing and the switch fused into one entry; and
   * the declared intent survived the undo, so the editor still thought the
   * line was a cue and re-uppercased it on the next keystroke.
   */
  function typeThenSwitch(word: string) {
    const start = EditorState.create({
      doc: '',
      extensions: [elementFlow(), editorSettings.of(settings), history()],
    });

    const typed = start.update({
      changes: { from: 0, insert: word },
      selection: EditorSelection.cursor(word.length),
      userEvent: 'input.type',
    }).state;

    return apply(switchElement('character'), typed);
  }

  it('restores the original casing in one step', () => {
    const switched = typeThenSwitch('Noah');
    expect(switched.doc.toString()).toBe('NOAH');

    let undone = switched;
    undo({ state: switched, dispatch: (tr) => (undone = tr.state) });

    // Not '' — the word must survive; only the switch is undone.
    expect(undone.doc.toString()).toBe('Noah');
  });

  it('drops the declared element, so typing does not re-capitalise', () => {
    const switched = typeThenSwitch('Noah');
    expect(switched.field(intentField)).not.toBeNull();

    let undone = switched;
    undo({ state: switched, dispatch: (tr) => (undone = tr.state) });

    expect(undone.field(intentField)).toBeNull();
  });

  it('redoes the switch', () => {
    const switched = typeThenSwitch('Noah');

    let undone = switched;
    undo({ state: switched, dispatch: (tr) => (undone = tr.state) });

    let redone = undone;
    redo({ state: undone, dispatch: (tr) => (redone = tr.state) });

    expect(redone.doc.toString()).toBe('NOAH');
  });
});

/* ========================================================================== */

describe('direct element switching', () => {
  const switchTo = (doc: string, type: Parameters<typeof switchElement>[0]) =>
    apply(switchElement(type), stateOf(doc)).doc.toString();

  it('rewrites the markup for the chosen type', () => {
    expect(switchTo('sniper scope pov', 'sceneHeading')).toBe('.SNIPER SCOPE POV');
    expect(switchTo('brick', 'character')).toBe('BRICK');
    expect(switchTo('dryly', 'parenthetical')).toBe('(dryly)');
    expect(switchTo('act one', 'section')).toBe('# act one');
  });

  it('only touches the line the caret is on', () => {
    const state = EditorState.create({
      doc: 'First line.\nsecond line',
      selection: EditorSelection.cursor(23),
      extensions: [elementFlow(), editorSettings.of(settings)],
    });
    expect(apply(switchElement('character'), state).doc.toString()).toBe(
      'First line.\nSECOND LINE',
    );
  });
});
