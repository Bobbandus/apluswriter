import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOW, elementFlow, enterCommand, switchElement, tabCommand } from './elementFlow';

/**
 * The element flow, tested as commands rather than through a DOM.
 *
 * These are `StateCommand`s, so they can be driven directly against an
 * `EditorState` with no browser involved. That makes the Enter/Tab behaviour —
 * the thing a writer touches thousands of times an hour — cheap enough to test
 * exhaustively.
 */

const settings = () => DEFAULT_FLOW;

function stateOf(doc: string, cursor = doc.length): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [elementFlow(settings)],
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

const enter = (state: EditorState) => apply(enterCommand(settings), state);
const tab = (state: EditorState) => apply(tabCommand(settings, false), state);

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
      tabCommand(flow, false),
      EditorState.create({
        doc: `${before}\n\n`,
        selection: EditorSelection.cursor(before.length + 2),
        extensions: [elementFlow(flow)],
      }),
    );

    const typed = declared.update({
      changes: { from: declared.doc.length, insert: name },
      selection: EditorSelection.cursor(declared.doc.length + name.length),
    }).state;

    return apply(enterCommand(flow), typed).doc.toString();
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
    const english = () => ({ ...DEFAULT_FLOW, locale: 'en' as const });
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
    const forward = apply(tabCommand(settings, false), stateOf('hello'));
    expect(forward.doc.toString()).toBe('HELLO');
    expect(apply(tabCommand(settings, true), forward).doc.toString()).toBe('!HELLO');
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
      extensions: [elementFlow(settings)],
    });
    expect(apply(switchElement('character'), state).doc.toString()).toBe(
      'First line.\nSECOND LINE',
    );
  });
});
