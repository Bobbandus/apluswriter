import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { toggleDualEdit } from './dual';

const apply = (text: string, caret: number) => {
  const edit = toggleDualEdit(text, caret);
  return edit ? text.slice(0, edit.from) + edit.insert + text.slice(edit.to) : null;
};

const SCRIPT = 'INT. A - DAG\n\nBRICK\nScrew retirement.\n\nSTEEL\nThey are coming.\n\nBRICK\nNästa.\n';

describe('dual dialogue toggle', () => {
  it('marks the cue of the speech the caret is in, from any line of that speech', () => {
    const cue = SCRIPT.indexOf('STEEL');
    const expected = SCRIPT.replace('STEEL', 'STEEL ^');
    expect(apply(SCRIPT, cue)).toBe(expected);
    expect(apply(SCRIPT, SCRIPT.indexOf('They'))).toBe(expected);
    expect(parse(expected).elements.find((e) => e.type === 'character' && e.name === 'STEEL')).toMatchObject({ dual: true });
  });

  it('takes the mark off again', () => {
    const marked = SCRIPT.replace('STEEL', 'STEEL ^');
    expect(apply(marked, marked.indexOf('They'))).toBe(SCRIPT);
  });

  it('keeps an extension in place when marking and unmarking', () => {
    const script = 'BRICK\nEtt.\n\nSTEEL (V.O.)\nTvå.\n';
    const marked = apply(script, script.indexOf('Två'))!;
    expect(marked).toBe('BRICK\nEtt.\n\nSTEEL (V.O.) ^\nTvå.\n');
    expect(apply(marked, marked.indexOf('Två'))).toBe(script);
  });

  it('does nothing for the first speech, for action, or outside any speech', () => {
    expect(toggleDualEdit(SCRIPT, SCRIPT.indexOf('BRICK'))).toBeNull();
    expect(toggleDualEdit(SCRIPT, SCRIPT.indexOf('INT.'))).toBeNull();
    expect(toggleDualEdit('Erik går.\n\nERIK\nHej.\n', 12)).toBeNull();
  });
});
