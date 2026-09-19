import { describe, expect, it } from 'vitest';
import { parse } from '../fountain/parse';
import { applyEdits, editsFor, resolveScene } from './apply';
import { onlyFormattingChanged } from './protocol';
import type { Suggestion } from './protocol';

const SCRIPT = [
  'INT. KÖK - DAG',
  '[[CAST: Vilde]]',
  '',
  'Erik lagar mat.',
  '',
  'EXT. SKOLGÅRD - KVÄLL',
  '',
  'VILDE',
  '(tyst)',
  'Hej.',
  '',
  'INT. KÖK - DAG',
  '',
  'Tomt.',
].join('\n');

const apply = (suggestion: Suggestion, source = SCRIPT) => {
  const result = editsFor(source, suggestion);
  if (!result.ok) throw new Error(result.reason);
  return applyEdits(source, result.edits);
};

describe('resolveScene', () => {
  it('tells two scenes with the same heading apart by position', () => {
    const script = parse(SCRIPT);
    expect(resolveScene(script, { index: 2, heading: 'INT. KÖK - DAG' })?.from).toBe(script.scenes[2]?.from);
    expect(resolveScene(script, { index: 0, heading: 'INT. KÖK - DAG' })?.from).toBe(0);
  });

  it('still finds a scene after one was inserted above it', () => {
    const shifted = `INT. NY SCEN - DAG\n\nNågot.\n\n${SCRIPT}`;
    const scene = resolveScene(parse(shifted), { index: 1, heading: 'EXT. SKOLGÅRD - KVÄLL' });
    expect(scene?.heading).toBe('EXT. SKOLGÅRD - KVÄLL');
  });
});

describe('synopsis', () => {
  it('inserts under the heading and its notes', () => {
    const out = apply({ kind: 'synopsis', scene: { index: 0, heading: 'INT. KÖK - DAG' }, text: 'Erik förbereder middagen.' });
    expect(out.startsWith('INT. KÖK - DAG\n[[CAST: Vilde]]\n\n= Erik förbereder middagen.\n\nErik lagar mat.')).toBe(true);
    expect(parse(out).scenes[0]?.synopsis).toBe('Erik förbereder middagen.');
  });

  it('replaces an existing synopsis rather than adding a second', () => {
    const once = apply({ kind: 'synopsis', scene: { index: 1, heading: 'EXT. SKOLGÅRD - KVÄLL' }, text: 'Först.' });
    const twice = apply({ kind: 'synopsis', scene: { index: 1, heading: 'EXT. SKOLGÅRD - KVÄLL' }, text: 'Sedan.' }, once);
    expect(twice.match(/^= /gm)).toHaveLength(1);
    expect(parse(twice).scenes[1]?.synopsis).toBe('Sedan.');
  });
});

describe('tags and metadata', () => {
  it('adds tags as notes under the heading, without duplicates', () => {
    const scene = { index: 0, heading: 'INT. KÖK - DAG' };
    const once = apply({ kind: 'tags', scene, tags: [{ kind: 'prop', value: 'Kastrull' }] });
    const twice = apply({ kind: 'tags', scene, tags: [{ kind: 'prop', value: 'Kastrull' }, { kind: 'sfx', value: 'Fräsande' }] }, once);
    expect(parse(twice).scenes[0]?.meta.tags?.map((t) => `${t.kind}:${t.value}`)).toEqual(['prop:Kastrull', 'sfx:Fräsande']);
  });

  it('sets metadata, replacing a value rather than stacking a contradiction', () => {
    const scene = { index: 0, heading: 'INT. KÖK - DAG' };
    const once = apply({ kind: 'metadata', scene, color: 'blue', cast: ['Vilde', 'Erik'] });
    const twice = apply({ kind: 'metadata', scene, color: 'red' }, once);
    const meta = parse(twice).scenes[0]?.meta;
    expect(meta?.color).toBe('red');
    expect(meta?.cast).toEqual(['Vilde', 'Erik']);
    expect(twice.match(/\[\[color:/g)).toHaveLength(1);
  });

  it('does not touch any line of the script itself', () => {
    const out = apply({ kind: 'metadata', scene: { index: 1, heading: 'EXT. SKOLGÅRD - KVÄLL' }, status: 'locked' });
    const words = (s: string) => parse(s).elements.filter((e) => e.type !== 'note').map((e) => e.raw);
    expect(words(out)).toEqual(words(SCRIPT));
  });
});

describe('format fixes', () => {
  /**
   * The guarantee that makes it safe to let an assistant suggest edits:
   * a "format" suggestion that changes even one word is refused.
   */
  it('refuses anything that changes a word', () => {
    const result = editsFor(SCRIPT, {
      kind: 'format',
      title: 'Fix',
      explanation: '',
      before: 'Erik lagar mat.',
      after: 'Erik lagar middag.',
      near: 0,
    });
    expect(result).toEqual({ ok: false, reason: 'notFormatting' });
  });

  it('applies a pure formatting change', () => {
    const source = 'INT. KÖK - DAG\n\nvilde\nHej.';
    const out = apply({ kind: 'format', title: 'Cue in capitals', explanation: '', before: 'vilde\nHej.', after: 'VILDE\nHej.', near: 16 }, source);
    expect(out).toBe('INT. KÖK - DAG\n\nVILDE\nHej.');
  });

  it('reports a fix whose text has since changed as stale', () => {
    const result = editsFor(SCRIPT, { kind: 'format', title: '', explanation: '', before: 'Not in the script.', after: 'NOT IN THE SCRIPT.', near: 0 });
    expect(result).toEqual({ ok: false, reason: 'stale' });
  });

  it('knows what counts as formatting', () => {
    // Moving whole lines is allowed: this is the misplaced parenthetical.
    expect(onlyFormattingChanged('VILDE\nHej.\n(tyst)', 'VILDE\n(tyst)\nHej.')).toBe(true);
    // Splitting a cue off its dialogue is formatting too.
    expect(onlyFormattingChanged('VILDE Hej.', 'VILDE\nHej.')).toBe(true);
    // But a line's own words never change, and nothing is dropped or added.
    expect(onlyFormattingChanged('VILDE\nHej.\n(tyst)', 'VILDE\n(glatt)\nHej.')).toBe(false);
    expect(onlyFormattingChanged('VILDE\nHej.\n(tyst)', 'VILDE\nHej.')).toBe(false);
    expect(onlyFormattingChanged('vilde', '@Vilde')).toBe(true);
    expect(onlyFormattingChanged('Hej.\n\n\nDå.', 'Hej.\n\nDå.')).toBe(true);
    expect(onlyFormattingChanged('Hej.', 'Hej då.')).toBe(false);
  });
});

describe('notes', () => {
  it('adds a to-do under a scene', () => {
    const out = apply({ kind: 'note', scene: { index: 1, heading: 'EXT. SKOLGÅRD - KVÄLL' }, text: 'Kolla ljuset', todo: true });
    expect(parse(out).todos.map((t) => t.text)).toEqual(['Kolla ljuset']);
  });
});

describe('applying several fixes as one edit', () => {
  // "Use all format fixes" must be a single Ctrl+Z. The batch is resolved fix
  // by fix against the evolving text, then handed to the editor as one edit;
  // this checks that the one edit reproduces the sequential result exactly.
  it('one combined edit equals the fixes applied one after another', async () => {
    const { lintScript } = await import('../production/lint');
    const { diffToEdit } = await import('./apply');
    const source = 'INT. KÖK - DAG\nErik.\n\nVILDE\nHej.\n(tyst)\n\nvilde\nDå.\n\nCut to:\n';
    const cards = lintScript(source, (rule) => ({ title: rule, explanation: '' })).map((i) => ({
      kind: 'format' as const, title: i.title, explanation: '', before: i.before, after: i.after, near: i.near,
    }));
    expect(cards.length).toBeGreaterThanOrEqual(3);

    let sequential = source;
    for (const card of cards) sequential = apply(card, sequential);

    const combined = applyEdits(source, diffToEdit(source, sequential));
    expect(combined).toBe(sequential);
    // And it is really one edit.
    expect(diffToEdit(source, sequential)).toHaveLength(1);
  });
});
