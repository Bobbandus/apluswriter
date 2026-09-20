import { describe, expect, it } from 'vitest';
import { findMatches, nextMatch, previousMatch, replaceEdits, replacementFor, type FindOptions, type FindScope } from './findReplace';
import { parse } from './parse';

const SOURCE = [
  'INT. KÖK - DAG',
  '',
  'Erik lagar mat. Erik är hungrig.',
  '',
  'ERIK',
  'Jag är Erik.',
  '',
  'VILDE',
  'Erik? Hej Erik.',
  '',
  'EXT. GATA - NATT',
  '',
  'ERIK',
  '(tyst)',
  'Det regnar.',
  '',
].join('\n');

const script = parse(SOURCE);
const find = (options: FindOptions, scope?: FindScope) => findMatches(script, options, scope);
const apply = (source: string, edits: { from: number; to: number; insert: string }[]) =>
  [...edits].reverse().reduce((text, edit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to), source);

describe('find', () => {
  it('finds every occurrence, case-insensitively by default', () => {
    expect(find({ query: 'erik' }).matches.length).toBe(7);
  });

  it('can be case-sensitive', () => {
    // The cue ERIK does not match, only the mixed-case Erik.
    expect(find({ query: 'Erik', caseSensitive: true }).matches.length).toBe(5);
  });

  it('can be whole-word, and treats å, ä and ö as letters', () => {
    expect(find({ query: 'er', wholeWord: true }).matches).toHaveLength(0);
    expect(findMatches(parse('Vi äter ätern. äter'), { query: 'äter', wholeWord: true }).matches).toHaveLength(2);
  });

  it('treats the query as plain text unless it is a regular expression', () => {
    expect(find({ query: 'Er.k' }).matches.length).toBe(0); // "." is not a wildcard here
    expect(find({ query: 'Erik\\?', regex: true }).matches).toHaveLength(1);
  });

  it('reports a broken regular expression instead of throwing', () => {
    const result = find({ query: '(', regex: true });
    expect(result.matches).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it('finds nothing for an empty query, and ignores empty regex matches', () => {
    expect(find({ query: '' }).matches).toEqual([]);
    expect(find({ query: 'q*', regex: true }).matches).toEqual([]);
  });
});

describe('scopes', () => {
  it('searches only the chosen scene', () => {
    const first = find({ query: 'erik' }, { kind: 'scene', index: 0 }).matches;
    const second = find({ query: 'erik' }, { kind: 'scene', index: 1 }).matches;
    expect(first.length + second.length).toBe(7);
    expect(second).toHaveLength(1); // the cue in the second scene
  });

  it('searches only what one character says', () => {
    const matches = find({ query: 'erik' }, { kind: 'dialogue', character: 'Erik' }).matches;
    // "Jag är Erik." only. Not the cue, not the action, not Vilde's line.
    expect(matches.map((m) => m.text)).toEqual(['Erik']);
    expect(SOURCE.slice(matches[0]!.from - 7, matches[0]!.to)).toBe('Jag är Erik');
    expect(find({ query: 'regnar' }, { kind: 'dialogue', character: 'ERIK' }).matches).toHaveLength(1);
    expect(find({ query: 'tyst' }, { kind: 'dialogue', character: 'ERIK' }).matches).toHaveLength(1);
  });

  it('has no matches for a character who does not speak', () => {
    expect(find({ query: 'erik' }, { kind: 'dialogue', character: 'NOBODY' }).matches).toEqual([]);
  });
});

describe('replace', () => {
  it('replaces every match, and the edits apply cleanly together', () => {
    const options = { query: 'Erik', caseSensitive: true };
    const { matches } = find(options);
    expect(apply(SOURCE, replaceEdits(matches, options, 'Otto'))).toBe(SOURCE.replace(/Erik/g, 'Otto'));
  });

  it('replaces only inside the scope', () => {
    const options = { query: 'Erik', caseSensitive: true };
    const { matches } = find(options, { kind: 'dialogue', character: 'VILDE' });
    const out = apply(SOURCE, replaceEdits(matches, options, 'Otto'));
    expect(out).toContain('Otto? Hej Otto.');
    expect(out).toContain('Erik lagar mat. Erik är hungrig.');
    expect(out).toContain('Jag är Erik.');
  });

  it('expands groups in a regular expression', () => {
    const options = { query: '(\\w+) (\\w+)\\.$', regex: true };
    // \w is ASCII-only, also with the u flag, so the sample avoids å, ä and ö.
    const text = parse('Han gar hem.\nDen ar rod.');
    const { matches } = findMatches(text, options);
    expect(apply(text.source, replaceEdits(matches, options, '$2 $1.'))).toBe('Han hem gar.\nDen rod ar.');
  });

  // ERIK -> Otto would turn a character cue into an action line.
  it('keeps a shouted match shouted, so a cue stays a cue', () => {
    const options = { query: 'erik' };
    const { matches } = find(options);
    const out = apply(SOURCE, replaceEdits(matches, options, 'Otto'));
    expect(out).toContain('\nOTTO\nJag är Otto.');
    expect(out).toContain('Otto lagar mat.');
    expect(parse(out).characters.map((c) => c.name)).toEqual(['OTTO', 'VILDE']);
  });

  it('leaves the case alone when the search is case-sensitive', () => {
    const options = { query: 'ERIK', caseSensitive: true };
    const { matches } = find(options);
    expect(apply(SOURCE, replaceEdits(matches, options, 'Otto'))).toContain('\nOtto\nJag');
  });

  it('does not shout a single capital letter', () => {
    const options = { query: 'e' };
    expect(replacementFor({ from: 0, to: 1, text: 'E' }, options, 'ö')).toBe('ö');
  });

  it('keeps the replacement literal when the search is not a regular expression', () => {
    const options = { query: 'Erik', caseSensitive: true };
    const { matches } = find(options);
    expect(replaceEdits(matches, options, '$1 & $&')[0]!.insert).toBe('$1 & $&');
  });
});

describe('moving between matches', () => {
  const { matches } = find({ query: 'Erik', caseSensitive: true });

  it('goes to the next match after the caret, wrapping at the end', () => {
    expect(nextMatch(matches, 0)).toBe(matches[0]);
    expect(nextMatch(matches, matches[1]!.from + 1)).toBe(matches[2]);
    expect(nextMatch(matches, SOURCE.length)).toBe(matches[0]);
    expect(nextMatch([], 0)).toBeNull();
  });

  it('goes to the previous match before the caret, wrapping at the start', () => {
    expect(previousMatch(matches, matches[2]!.from)).toBe(matches[1]);
    expect(previousMatch(matches, 0)).toBe(matches[matches.length - 1]);
    expect(previousMatch([], 0)).toBeNull();
  });
});
