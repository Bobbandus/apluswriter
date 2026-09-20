import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { __testing, fountainAutocomplete } from './autocomplete';
import { elementFlow } from './elementFlow';
import { editorSettings, DEFAULT_EDITOR_SETTINGS } from './settings';

const { completionField, move } = __testing;

const dictionary = {
  characters: ['ERIK', 'VILDE', 'NOAH'],
  locations: ['KÖK', 'SKOLGÅRD'],
  tags: [],
  characterCues: { ERIK: 12, VILDE: 9, NOAH: 2 },
};

function stateOf(doc: string, cursor = doc.length): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [
      editorSettings.of(DEFAULT_EDITOR_SETTINGS),
      elementFlow(),
      fountainAutocomplete({ dictionary, labels: {} }),
    ],
  });
}

const completion = (doc: string) => stateOf(doc).field(completionField);

describe('where suggestions appear', () => {
  it('offers a name typed in lower case, as a quiet ghost', () => {
    const state = completion('INT. KÖK - DAG\n\nHan kommer in.\n\ner');
    expect(state?.mode).toBe('ghost');
    expect(state?.items[0]?.value).toBe('ERIK');
  });

  // The complaint that started this: suggestions popping up in the middle of
  // ordinary writing. A name can only start a block.
  it('stays silent in the middle of a paragraph', () => {
    expect(completion('INT. KÖK - DAG\n\nHan ser er')).toBeNull();
  });

  it('stays silent on a shouted action line nobody could be called', () => {
    expect(completion('INT. KÖK - DAG\n\nTHE DOOR SLAMS')).toBeNull();
  });

  it('shows a list for a cue typed in capitals', () => {
    const state = completion('INT. KÖK - DAG\n\nV');
    expect(state?.mode).toBe('list');
    expect(state?.items[0]?.value).toBe('VILDE');
  });

  it('does not suggest what is already typed in full', () => {
    expect(completion('INT. KÖK - DAG\n\nERIK')).toBeNull();
  });

  it('completes the location and then the time of day in a heading', () => {
    expect(completion('INT. SK')?.items[0]?.value).toBe('SKOLGÅRD');
    expect(completion('INT. SKOLGÅRD - KV')?.items[0]?.value).toBe('KVÄLL');
  });

  it('predicts the next speaker on an empty line after dialogue', () => {
    const doc = ['INT. KÖK - DAG', '', 'ERIK', 'Hej.', '', 'VILDE', 'Hej själv.', '', ''].join('\n');
    const state = completion(doc);
    expect(state?.mode).toBe('ghost');
    expect(state?.items[0]?.value).toBe('ERIK');
  });

  it('does not predict a speaker after action', () => {
    expect(completion('INT. KÖK - DAG\n\nHan väntar.\n\n')).toBeNull();
  });
});

describe('Enter is never taken', () => {
  /**
   * The rule that keeps fast writing fast. A popover that swallows Enter
   * means every cue typed in capitals costs an extra keystroke, and the
   * writer learns to fear the box.
   */
  it('is not marked as navigated until the arrows are used', () => {
    const state = stateOf('INT. KÖK - DAG\n\nE');
    expect(state.field(completionField)?.navigated).toBe(false);

    let next = state;
    (move(1) as StateCommand)({ state, dispatch: (tr) => (next = tr.state) });
    expect(next.field(completionField)?.navigated).toBe(true);
  });
});

describe('capitals', () => {
  it('matches names from their start only', () => {
    // NOAH contains an A; a line starting "A" must not summon him.
    expect(completion('INT. KÖK - DAG\n\nA')).toBeNull();
  });
});

// The dictionary follows the script through a parse that runs a moment behind the keystrokes.
// Type PLATS and delete the S: for an instant PLATS is still listed, and used to come back as a
// completion of the half-word the writer was in the middle of deleting.
describe('a word that has just been deleted', () => {
  const lagging = {
    ...dictionary,
    locations: [...dictionary.locations, 'PLATS'],
    scriptOnly: { characters: [], locations: ['PLATS'] },
  };

  const completionWith = (doc: string, dict: typeof lagging) =>
    EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [editorSettings.of(DEFAULT_EDITOR_SETTINGS), elementFlow(), fountainAutocomplete({ dictionary: dict, labels: {} })],
    }).field(completionField);

  it('is not offered back when the only place it was written is the line being edited', () => {
    expect(completionWith('INT. PLAT', lagging)).toBeNull();
  });

  it('is still offered when the script writes it on another line', () => {
    const state = completionWith('INT. PLATS - DAG\n\nEtt.\n\nINT. PLAT', lagging);
    expect(state?.items.map((item) => item.value)).toEqual(['PLATS']);
  });

  it('is still offered when the writer saved it, even if no scene uses it yet', () => {
    const saved = { ...lagging, scriptOnly: { characters: [], locations: [] } };
    expect(completionWith('INT. PLAT', saved)?.items.map((item) => item.value)).toEqual(['PLATS']);
  });
});
