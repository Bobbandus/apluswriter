import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { removeTodo } from './todos';

/** Finish the first to-do in a script and return what is left. */
function finish(source: string, index = 0): string {
  const todo = parse(source).todos[index];
  if (!todo) throw new Error('no to-do in the source');
  const edit = removeTodo(source, todo);
  return source.slice(0, edit.from) + source.slice(edit.to);
}

describe('removeTodo', () => {
  it('takes a note on its own line and nothing else', () => {
    expect(finish('INT. KÖK - DAG\n[[todo: kolla ljuset]]\n\nErik lagar mat.\n')).toBe(
      'INT. KÖK - DAG\n\nErik lagar mat.\n',
    );
  });

  // Every extra blank line is an intentional empty action line in Fountain,
  // so leaving two would change the script, not just tidy it.
  it('does not leave two blank lines where a whole block used to be', () => {
    const out = finish('Erik lagar mat.\n\n[[todo: fixa slutet]]\n\nDe äter.\n');
    expect(out).toBe('Erik lagar mat.\n\nDe äter.\n');
    expect(out).not.toMatch(/\n{3}/);
  });

  it('takes one space with a note in the middle of a line', () => {
    expect(finish('Erik lagar [[todo: vad lagar han?]] mat.')).toBe('Erik lagar mat.');
    expect(finish('Erik lagar mat. [[todo: mer]]')).toBe('Erik lagar mat.');
    expect(finish('[[todo: mer]] Erik lagar mat.')).toBe('Erik lagar mat.');
  });

  it('handles the last line of the file without leaving a trailing newline behind', () => {
    expect(finish('Erik lagar mat.\n[[todo: sist]]')).toBe('Erik lagar mat.');
  });

  it('handles a note that is the whole script', () => {
    expect(finish('[[todo: allt]]')).toBe('');
  });

  it('handles a note on the very first line', () => {
    expect(finish('[[todo: först]]\nINT. KÖK - DAG\n\nErik.')).toBe('INT. KÖK - DAG\n\nErik.');
  });

  it('takes a note that spans two lines', () => {
    expect(finish('INT. KÖK - DAG\n[[todo: en lång\nanteckning]]\n\nErik.')).toBe('INT. KÖK - DAG\n\nErik.');
  });

  it('removes exactly the one that was ticked and no other', () => {
    const source = 'INT. A - DAG\n[[todo: ett]]\n\nHej.\n\nINT. B - DAG\n[[todo: två]]\n\nDå.\n';
    const out = finish(source, 1);
    expect(parse(out).todos.map((todo) => todo.text)).toEqual(['ett']);
    expect(out).toContain('INT. B - DAG\n\nDå.');
  });

  it('never changes a word of the script itself', () => {
    const source = 'INT. KÖK - DAG\n[[todo: x]]\n\nERIK\nHej.\n\n[[todo: y]]\n\nDå.\n';
    const words = (text: string) => parse(text).elements.filter((el) => el.type !== 'note').map((el) => el.raw);
    expect(words(finish(source))).toEqual(words(source));
    expect(words(finish(source, 1))).toEqual(words(source));
  });
});
