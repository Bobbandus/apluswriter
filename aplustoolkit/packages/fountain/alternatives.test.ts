import { describe, expect, it } from 'vitest';
import { alternativesOf, removeAlternative, saveAlternative, swapAlternative } from './alternatives';
import { parse } from './parse';
import { reorderScenes } from './structure';

const SCRIPT = ['INT. KÖK - DAG', '', 'Erik lagar mat.', '', 'EXT. GATA - NATT', '', 'Det regnar.', ''].join('\n');
const headings = (s: string) => parse(s).scenes.map((scene) => scene.heading);

describe('scene alternatives', () => {
  it('parks a copy of the scene and leaves the script reading the same', () => {
    const out = saveAlternative(SCRIPT, 0, 'Utan mat');
    expect(headings(out)).toEqual(['INT. KÖK - DAG', 'EXT. GATA - NATT']);
    expect(alternativesOf(out, 0)).toEqual([{ label: 'Utan mat', text: 'INT. KÖK - DAG\n\nErik lagar mat.' }]);
    expect(alternativesOf(out, 1)).toEqual([]);
    // Nothing but the parked block was added; the active script is untouched.
    expect(out.replace(/\/\* aplus:alt[\s\S]*?\*\/\n\n?/g, '')).toBe(SCRIPT);
  });

  it('swaps a parked version in, parking what was active, and swapping back undoes it', () => {
    const parked = saveAlternative(SCRIPT, 0, 'Original');
    const edited = parked.replace('Erik lagar mat.', 'Erik bränner maten.');
    const swapped = swapAlternative(edited, 0, 0, 'Bränd');

    expect(swapped).toContain('Erik lagar mat.');
    expect(alternativesOf(swapped, 0)[0]).toMatchObject({ label: 'Bränd', text: 'INT. KÖK - DAG\n\nErik bränner maten.' });

    const back = swapAlternative(swapped, 0, 0, 'Original');
    expect(back).toContain('Erik bränner maten.');
    expect(alternativesOf(back, 0)[0]?.text).toContain('Erik lagar mat.');
  });

  it('lets a parked version have a different heading, and does not count it as a scene', () => {
    const parked = saveAlternative(SCRIPT, 1, 'I bilen').replace('Det regnar.', 'Regn.');
    expect(headings(parked)).toEqual(['INT. KÖK - DAG', 'EXT. GATA - NATT']);
    expect(headings(swapAlternative(parked, 1, 0, 'Före'))).toEqual(['INT. KÖK - DAG', 'EXT. GATA - NATT']);
  });

  it('removes one and only that one', () => {
    let out = saveAlternative(SCRIPT, 0, 'A');
    out = saveAlternative(out, 0, 'B');
    expect(alternativesOf(out, 0).map((alt) => alt.label)).toEqual(['A', 'B']);
    expect(alternativesOf(removeAlternative(out, 0, 0), 0).map((alt) => alt.label)).toEqual(['B']);
  });

  // A boneyard ends at the first star-slash, so one inside a parked scene must
  // not end it early and must come back exactly as written.
  it('survives a star-slash inside the scene', () => {
    const tricky = 'INT. A - DAG\n\nHan skriver */ på väggen.';
    const out = saveAlternative(tricky, 0, 'Vägg');
    expect(alternativesOf(out, 0)[0]?.text).toBe(tricky);
    expect(parse(out).scenes).toHaveLength(1);
  });

  it('travels with its scene when the scene is moved', () => {
    const parked = saveAlternative(SCRIPT, 0, 'Med mat');
    const moved = reorderScenes(parked, 0, 1);
    expect(headings(moved)).toEqual(['EXT. GATA - NATT', 'INT. KÖK - DAG']);
    expect(alternativesOf(moved, 1)[0]?.label).toBe('Med mat');
    expect(alternativesOf(moved, 0)).toEqual([]);
  });

  it('keeps the blank lines between scenes as they were', () => {
    const out = swapAlternative(saveAlternative(SCRIPT, 0, 'A'), 0, 0, 'B');
    expect(out.match(/\n\nEXT\. GATA/g)).toHaveLength(1);
  });

  it('does nothing for a scene or a version that does not exist', () => {
    expect(saveAlternative(SCRIPT, 9, 'x')).toBe(SCRIPT);
    expect(swapAlternative(SCRIPT, 0, 3, 'x')).toBe(SCRIPT);
    expect(removeAlternative(SCRIPT, 0, 0)).toBe(SCRIPT);
  });
});
