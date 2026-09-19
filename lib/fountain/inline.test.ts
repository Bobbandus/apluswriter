import { describe, expect, it } from 'vitest';
import { findNotes, parseTag, scanInline } from './inline';

/** Convenience: the span types found, in document order. */
const types = (raw: string) => scanInline(raw).spans.map((s) => s.type);
const display = (raw: string) => scanInline(raw).text;

describe('emphasis', () => {
  it('handles the four spec forms', () => {
    expect(types('*italics*')).toEqual(['italic']);
    expect(types('**bold**')).toEqual(['bold']);
    expect(types('***bold italics***')).toEqual(['boldItalic']);
    expect(types('_underline_')).toEqual(['underline']);
  });

  it('strips the delimiters from the display text', () => {
    expect(display('*italics*')).toBe('italics');
    expect(display('***bold italics***')).toBe('bold italics');
    expect(display('He said **nothing** at all.')).toBe('He said nothing at all.');
  });

  // Straight from the spec.
  it('nests emphasis', () => {
    const raw = "_Steel's face FILLS the *Leupold Mark 4* scope_";
    expect(types(raw)).toEqual(['underline', 'italic']);
    expect(display(raw)).toBe("Steel's face FILLS the Leupold Mark 4 scope");
  });

  it('never carries emphasis across a line break', () => {
    // If this paired, one stray asterisk would italicise the rest of a scene.
    expect(types('*not\nemphasis*')).toEqual([]);
    expect(display('*not\nemphasis*')).toBe('*not\nemphasis*');
  });

  it('treats the space around a delimiter as meaningful', () => {
    // An opener may not be followed by a space, so arithmetic survives.
    expect(types('4 * 3 * 2')).toEqual([]);
    expect(display('4 * 3 * 2')).toBe('4 * 3 * 2');
    // A closer may not be preceded by one.
    expect(types('*open but not closed *')).toEqual([]);
  });

  it('does not treat an empty delimiter pair as emphasis', () => {
    expect(types('**')).toEqual([]);
    expect(types('****')).toEqual([]);
  });

  it('finds several spans on one line', () => {
    expect(types('**bold** and *italic*')).toEqual(['bold', 'italic']);
    expect(display('**bold** and *italic*')).toBe('bold and italic');
  });

  it('reports absolute offsets covering the delimiters', () => {
    const [span] = scanInline('ab *cd* ef').spans;
    expect(span).toMatchObject({ type: 'italic', from: 3, to: 7, contentFrom: 4, contentTo: 6 });
  });

  it('honours an offset', () => {
    const [span] = scanInline('*x*', 100).spans;
    expect(span).toMatchObject({ from: 100, to: 103 });
  });
});

describe('escapes', () => {
  it('stops a backslashed delimiter from pairing', () => {
    expect(types('\\*not italic\\*')).toEqual(['escape', 'escape']);
    expect(display('\\*not italic\\*')).toBe('*not italic*');
  });

  it('escapes underscores too', () => {
    expect(display('snake\\_case')).toBe('snake_case');
  });

  it('lets a doubled backslash escape itself', () => {
    expect(display('\\\\')).toBe('\\');
  });
});

describe('notes', () => {
  it('finds an inline note and removes it from the display text', () => {
    const raw = 'Action [[a note]] here';
    expect(types(raw)).toEqual(['note']);
    expect(display(raw)).toBe('Action  here');
  });

  it('allows a note to span single line breaks', () => {
    expect(findNotes('[[one\ntwo]]')).toHaveLength(1);
  });

  // Nothing in Fountain looks past a double line break for its closing token,
  // so a typo cannot swallow the rest of the script.
  it('refuses to span a blank line', () => {
    expect(findNotes('[[one\n\ntwo]]')).toHaveLength(0);
  });

  // Two spaces on an otherwise empty line mean "keep this together" — that is
  // not a blank line, and must not terminate a note.
  it('is not terminated by a two-space line', () => {
    expect(findNotes('[[one\n  \ntwo]]')).toHaveLength(1);
  });

  it('leaves an unclosed bracket pair as literal text', () => {
    expect(findNotes('[[never closed')).toHaveLength(0);
    expect(display('[[never closed')).toBe('[[never closed');
  });

  it('closes on the first ]]', () => {
    const [note] = findNotes('[[a]] and [[b]]');
    expect(note?.content).toBe('a');
    expect(findNotes('[[a]] and [[b]]')).toHaveLength(2);
  });
});

describe('tags', () => {
  it('distinguishes a tag from a plain note', () => {
    expect(types('[[#prop Revolver]]')).toEqual(['tag']);
    expect(types('[[just a note]]')).toEqual(['note']);
  });

  it('splits a tag into kind and value', () => {
    expect(parseTag('#prop Revolver')).toEqual({ kind: 'prop', value: 'Revolver' });
    expect(parseTag('#sfx Door slam')).toEqual({ kind: 'sfx', value: 'Door slam' });
    expect(parseTag('#wardrobe Orange overall')).toEqual({
      kind: 'wardrobe',
      value: 'Orange overall',
    });
  });

  it('lowercases the kind but leaves the value alone', () => {
    expect(parseTag('#PROP Revolver')).toEqual({ kind: 'prop', value: 'Revolver' });
  });

  it('returns null for something that is not a tag', () => {
    expect(parseTag('just a note')).toBeNull();
  });
});
