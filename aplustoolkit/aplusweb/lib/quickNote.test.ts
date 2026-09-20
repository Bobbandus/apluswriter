import { describe, expect, it } from 'vitest';
import { parse } from '@aplus/fountain/parse';
import { quickNoteEdit } from './quickNote';

const apply = (text: string, caret: number, note: string) => {
  const edit = quickNoteEdit(text, caret, note);
  return edit ? text.slice(0, edit.from) + edit.insert + text.slice(edit.to) : text;
};

describe('quick note', () => {
  it('goes at the end of the line the caret is on, even from the middle of a word', () => {
    expect(apply('Erik lagar mat.\n\nNästa.', 5, 'byt maträtt')).toBe('Erik lagar mat. [[todo: byt maträtt]]\n\nNästa.');
  });

  it('works on the last line and on an empty one', () => {
    expect(apply('Slut', 2, 'x')).toBe('Slut [[todo: x]]');
    expect(apply('a\n\nb', 2, 'x')).toBe('a\n[[todo: x]]\nb');
  });

  it('leaves the text alone for an empty note, and cannot be broken by brackets or line breaks', () => {
    expect(quickNoteEdit('a', 0, '   ')).toBeNull();
    expect(apply('a', 0, 'fel ]] här\nrad två')).toBe('a [[todo: fel ] ] här rad två]]');
  });

  it('shows up as a to-do in the script', () => {
    const script = parse(apply('INT. A - DAG\n\nErik lagar mat.', 20, 'byt maträtt'));
    expect(script.todos.map((todo) => todo.text)).toEqual(['byt maträtt']);
  });
});
