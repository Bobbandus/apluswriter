import { describe, expect, it } from 'vitest';
import { applyEdits } from '../bridge/apply';
import { onlyFormattingChanged } from '../bridge/protocol';
import { lintScript } from './lint';

const t = (rule: string) => ({ title: rule, explanation: '' });
const lint = (s: string) => lintScript(s, t);
const fixAll = (s: string) => applyEdits(s, lint(s).map((i) => ({ from: i.near, to: i.near + i.before.length, insert: i.after })));

describe('format check', () => {
  it('moves a parenthetical stranded under its dialogue', () => {
    const src = 'INT. KÖK - DAG\n\nVILDE\nHej.\n(tyst)\n';
    const [issue] = lint(src);
    expect(issue?.rule).toBe('trailingParenthetical');
    expect(fixAll(src)).toBe('INT. KÖK - DAG\n\nVILDE\n(tyst)\nHej.\n');
  });

  it('pulls a parenthetical back that a blank line made into action', () => {
    const src = 'INT. KÖK - DAG\n\nVILDE\nHej.\n\n(tyst)\n';
    expect(lint(src)[0]?.rule).toBe('orphanParenthetical');
    expect(fixAll(src)).toBe('INT. KÖK - DAG\n\nVILDE\n(tyst)\nHej.\n');
  });

  it('adds the blank line a heading needs', () => {
    const src = 'INT. KÖK - DAG\nErik lagar mat.\n';
    expect(fixAll(src)).toBe('INT. KÖK - DAG\n\nErik lagar mat.\n');
  });

  it('capitalises a known character typed in lower case', () => {
    const src = 'INT. KÖK - DAG\n\nVILDE\nHej.\n\nvilde\nDå.\n';
    expect(fixAll(src)).toBe('INT. KÖK - DAG\n\nVILDE\nHej.\n\nVILDE\nDå.\n');
  });

  it('capitalises a transition', () => {
    expect(fixAll('Han går.\n\nCut to:\n')).toBe('Han går.\n\nCUT TO:\n');
  });

  it('finds nothing in a clean script', () => {
    expect(lint('INT. KÖK - DAG\n\nVILDE\n(tyst)\nHej.\n\nHan går.\n')).toEqual([]);
  });

  // The promise: a fix may never change a word.
  it('every fix changes formatting only', () => {
    const src = 'INT. KÖK - DAG\nErik.\n\nVILDE\nHej.\n(tyst)\n\nvilde\nDå.\n\nCut to:\n';
    for (const issue of lint(src)) expect(onlyFormattingChanged(issue.before, issue.after)).toBe(true);
  });
});
