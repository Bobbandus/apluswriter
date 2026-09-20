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

  it('sets story day and energy, keeping the spelling the writer already used', () => {
    const scene = { index: 0, heading: 'INT. KÖK - DAG' };
    const once = apply({ kind: 'metadata', scene, day: 3, energy: 7 });
    expect(parse(once).scenes[0]?.meta).toMatchObject({ day: 3, energy: 7 });
    const swedish = once.replace('[[day: 3]]', '[[dag: 3]]');
    const again = apply({ kind: 'metadata', scene, day: 4 }, swedish);
    expect(again).toContain('[[dag: 4]]');
    expect(again.match(/\[\[(?:day|dag):/g)).toHaveLength(1);
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

describe('rewrites', () => {
  const scene = { index: 1, heading: 'EXT. SKOLGÅRD - KVÄLL' };
  const rewrite = (hunks: { before: string; after: string }[]): Suggestion => ({
    kind: 'rewrite',
    scene,
    title: 'Vassare',
    explanation: '',
    hunks,
  });

  it('applies every change in one go', () => {
    const out = apply(rewrite([
      { before: 'Hej.', after: 'Hej själv.' },
      { before: 'Erik lagar mat.', after: 'Erik bränner vidbränd mat.' },
    ]));
    expect(out).toContain('Hej själv.');
    expect(out).toContain('Erik bränner vidbränd mat.');
  });

  it('applies only the changes the writer ticked', () => {
    const result = editsFor(SCRIPT, rewrite([
      { before: 'Hej.', after: 'Hej själv.' },
      { before: 'Erik lagar mat.', after: 'Erik bränner maten.' },
    ]), [1]);
    if (!result.ok) throw new Error(result.reason);
    const out = applyEdits(SCRIPT, result.edits);
    expect(out).toContain('Erik bränner maten.');
    expect(out).toContain('Hej.');
    expect(out).not.toContain('Hej själv.');
  });

  // Two changes to lines that read the same must not both grab the first one.
  it('gives two identical excerpts two different places in the text', () => {
    const source = 'INT. KÖK - DAG\n\nVILDE\nHej.\n\nERIK\nHej.\n';
    const result = editsFor(source, {
      kind: 'rewrite',
      title: '',
      explanation: '',
      hunks: [
        { before: 'Hej.', after: 'Tja.' },
        { before: 'Hej.', after: 'Hejsan.' },
      ],
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.edits.map((edit) => edit.from).sort((a, b) => a - b)).toHaveLength(2);
    expect(new Set(result.edits.map((edit) => edit.from)).size).toBe(2);
    expect(applyEdits(source, result.edits)).toBe('INT. KÖK - DAG\n\nVILDE\nTja.\n\nERIK\nHejsan.\n');
  });

  it('keeps the changes it can still place, and names the ones it cannot', () => {
    const result = editsFor(SCRIPT, rewrite([
      { before: 'Hej.', after: 'Hej själv.' },
      { before: 'En replik som inte finns.', after: 'Spelar ingen roll.' },
    ]));
    if (!result.ok) throw new Error(result.reason);
    expect(result.stale).toEqual([1]);
    expect(applyEdits(SCRIPT, result.edits)).toContain('Hej själv.');
  });

  it('is stale only when nothing at all can be placed', () => {
    expect(editsFor(SCRIPT, rewrite([{ before: 'Finns inte.', after: 'Nej.' }]))).toEqual({
      ok: false,
      reason: 'stale',
    });
  });
});

describe('alternatives', () => {
  const suggestion: Suggestion = {
    kind: 'alternatives',
    scene: { index: 1, heading: 'EXT. SKOLGÅRD - KVÄLL' },
    title: 'Tre sätt',
    before: 'Hej.',
    options: [{ label: 'kortare', after: 'Tja.' }, { label: 'undvikande', after: 'Mm.' }],
  };

  it('applies the option the writer chose', () => {
    const result = editsFor(SCRIPT, suggestion, [1]);
    if (!result.ok) throw new Error(result.reason);
    expect(applyEdits(SCRIPT, result.edits)).toContain('Mm.');
  });

  it('takes the first option when none was named', () => {
    expect(apply(suggestion)).toContain('Tja.');
  });
});

describe('inserting new material', () => {
  it('puts a new scene after the one it was anchored to, with blank lines around it', () => {
    const out = apply({
      kind: 'insert',
      title: 'En scen till',
      explanation: '',
      anchor: { afterScene: { index: 0, heading: 'INT. KÖK - DAG' } },
      text: 'INT. HALL - DAG\n\nHan tar på sig jackan.',
    });
    expect(out).toContain('Erik lagar mat.\n\nINT. HALL - DAG\n\nHan tar på sig jackan.\n\nEXT. SKOLGÅRD - KVÄLL');
    // And it really reads as a scene, not as action stuck to its neighbour.
    expect(parse(out).scenes.map((scene) => scene.heading)).toEqual([
      'INT. KÖK - DAG',
      'INT. HALL - DAG',
      'EXT. SKOLGÅRD - KVÄLL',
      'INT. KÖK - DAG',
    ]);
  });

  it('adds lines after an exact excerpt', () => {
    const out = apply({
      kind: 'insert',
      title: 'En replik till',
      explanation: '',
      anchor: { after: 'Hej.' },
      text: 'VILDE\nOch hej igen.',
    });
    expect(out).toContain('Hej.\n\nVILDE\nOch hej igen.');
  });

  it('does not leave a run of blank lines behind', () => {
    const out = apply({
      kind: 'insert',
      title: '',
      explanation: '',
      anchor: { afterScene: { index: 0, heading: 'INT. KÖK - DAG' } },
      text: '\n\nHan diskar.\n\n',
    });
    expect(out).not.toMatch(/\n{3}/);
  });

  it('reports an anchor that is no longer in the script', () => {
    expect(
      editsFor(SCRIPT, { kind: 'insert', title: '', explanation: '', anchor: { after: 'Finns inte.' }, text: 'Nytt.' }),
    ).toEqual({ ok: false, reason: 'stale' });
    expect(
      editsFor(SCRIPT, {
        kind: 'insert',
        title: '',
        explanation: '',
        anchor: { afterScene: { index: 9, heading: 'INT. INGENSTANS - DAG' } },
        text: 'Nytt.',
      }),
    ).toEqual({ ok: false, reason: 'sceneNotFound' });
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
