import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { reorderScenes } from './structure';

const headings = (source: string) => parse(source).scenes.map((scene) => scene.heading);

const SCRIPT = [
  'INT. KÖK - DAG',
  '',
  'Erik lagar mat.',
  '',
  'EXT. GATA - NATT',
  '',
  'Det regnar.',
  '',
  'INT. BIL - NATT',
  '',
  'De kör.',
  '',
].join('\n');

describe('reorderScenes', () => {
  it('moves a scene down and keeps every word', () => {
    const out = reorderScenes(SCRIPT, 0, 2);
    expect(headings(out)).toEqual(['EXT. GATA - NATT', 'INT. BIL - NATT', 'INT. KÖK - DAG']);
    expect(out).toContain('Erik lagar mat.');
    // Nothing gained or lost: the same characters, rearranged.
    const letters = (text: string) => text.replace(/\s/g, '').split('').sort().join('');
    expect(letters(out)).toBe(letters(SCRIPT));
  });

  it('moves a scene up', () => {
    expect(headings(reorderScenes(SCRIPT, 2, 0))).toEqual([
      'INT. BIL - NATT',
      'INT. KÖK - DAG',
      'EXT. GATA - NATT',
    ]);
  });

  it('leaves the document alone when there is nothing to do', () => {
    expect(reorderScenes(SCRIPT, 1, 1)).toBe(SCRIPT);
    expect(reorderScenes(SCRIPT, 0, 9)).toBe(SCRIPT);
    expect(reorderScenes(SCRIPT, -1, 0)).toBe(SCRIPT);
    expect(reorderScenes('Bara en rad, ingen scen.', 0, 1)).toBe('Bara en rad, ingen scen.');
  });

  it('keeps the title page and anything before the first heading', () => {
    const source = `Title: Manus\nAuthor: Vilde\n\nEn bild ur ingenstans.\n\n${SCRIPT}`;
    const out = reorderScenes(source, 0, 1);
    expect(out.startsWith('Title: Manus\nAuthor: Vilde\n\nEn bild ur ingenstans.\n\n')).toBe(true);
    expect(parse(out).titlePage?.fields[0]?.values).toEqual(['Manus']);
    expect(headings(out)[0]).toBe('EXT. GATA - NATT');
  });

  // An act break belongs to the structure of the script, not to the scene
  // above it. Dragging a card must not drag the act heading along.
  it('leaves act headings where the writer put them', () => {
    const source = [
      '# Akt I',
      '',
      'INT. KÖK - DAG',
      '',
      'Erik lagar mat.',
      '',
      '# Akt II',
      '',
      'EXT. GATA - NATT',
      '',
      'Det regnar.',
      '',
      'INT. BIL - NATT',
      '',
      'De kör.',
      '',
    ].join('\n');

    const out = reorderScenes(source, 1, 2);
    expect(headings(out)).toEqual(['INT. KÖK - DAG', 'INT. BIL - NATT', 'EXT. GATA - NATT']);

    // Both acts still open where they did, and the scene that moved into
    // act two is the one that was dragged there.
    const lines = out.split('\n').filter(Boolean);
    expect(lines.indexOf('# Akt I')).toBeLessThan(lines.indexOf('INT. KÖK - DAG'));
    expect(lines.indexOf('# Akt II')).toBeLessThan(lines.indexOf('INT. BIL - NATT'));
    expect(parse(out).sections.map((section) => section.title)).toEqual(['Akt I', 'Akt II']);
  });

  it('carries a scene\'s notes and synopsis with it', () => {
    const source = [
      'INT. KÖK - DAG',
      '[[CAST: Vilde]]',
      '',
      '= Erik lagar middag.',
      '',
      'Erik lagar mat.',
      '',
      'EXT. GATA - NATT',
      '',
      'Det regnar.',
      '',
    ].join('\n');

    const moved = parse(reorderScenes(source, 0, 1)).scenes[1];
    expect(moved?.heading).toBe('INT. KÖK - DAG');
    expect(moved?.synopsis).toBe('Erik lagar middag.');
    expect(moved?.meta.cast).toEqual(['Vilde']);
  });

  // The spacing is the writer's, and it belongs to the place in the document
  // rather than to the scene that happens to sit there.
  it('does not grow or shrink the blank lines', () => {
    const source = 'INT. A - DAG\n\nEtt.\n\n\n\nEXT. B - NATT\n\nTvå.\n';
    const out = reorderScenes(source, 0, 1);
    expect(out.match(/\n/g)).toHaveLength((source.match(/\n/g) ?? []).length);
    expect(out).toBe('EXT. B - NATT\n\nTvå.\n\n\n\nINT. A - DAG\n\nEtt.\n');
  });

  it('handles a last scene with no newline at the end', () => {
    const source = 'INT. A - DAG\n\nEtt.\n\nEXT. B - NATT\n\nTvå.';
    const out = reorderScenes(source, 1, 0);
    expect(out.endsWith('\n')).toBe(false);
    expect(headings(out)).toEqual(['EXT. B - NATT', 'INT. A - DAG']);
  });

  it('survives being dragged around in circles', () => {
    let text = SCRIPT;
    for (const [from, to] of [[0, 2], [2, 1], [1, 0], [0, 1], [1, 2], [2, 0]] as const) {
      text = reorderScenes(text, from, to);
      expect(parse(text).scenes).toHaveLength(3);
    }
    const words = (source: string) => source.split(/\s+/).filter(Boolean).sort();
    expect(words(text)).toEqual(words(SCRIPT));
  });
});
