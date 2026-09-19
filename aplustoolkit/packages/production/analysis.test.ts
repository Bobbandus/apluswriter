import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../fountain/parse';
import { characterLines, scheduleGroups, sceneDifficulty, structureReport } from './analysis';

const feature = parse(readFileSync(join(process.cwd(), 'fixtures/official/Big-Fish.fountain'), 'utf8'));

describe('difficulty', () => {
  it('flags night, exterior, rain and says why', () => {
    const script = parse('EXT. SKOLGÅRD - NATT\n\nDet regnar. Vilde springer.\n\nINT. KÖK - DAG\n\nHon äter.');
    const [hard, easy] = sceneDifficulty(script);
    expect(hard?.reasons).toEqual(expect.arrayContaining(['night', 'exterior', 'rain']));
    expect(hard?.level).not.toBe('easy');
    expect(easy).toMatchObject({ level: 'easy', reasons: [] });
  });

  it('rates a stunt-and-fire scene hard', () => {
    const s = parse('EXT. VÄG - NATT\n\nBilen exploderar. Det brinner. Statister flyr.');
    expect(sceneDifficulty(s)[0]?.level).toBe('hard');
  });
});

describe('structure', () => {
  it('places the classic marks inside the script', () => {
    const report = structureReport(feature, 'letter');
    expect(report.pages).toBeGreaterThan(100);
    const [, mid] = report.marks;
    expect(mid?.page).toBe(Math.round(report.pages / 2));
    expect(mid?.scene).not.toBeNull();
  });

  it('lists the longest scenes and per-scene spans in order', () => {
    const report = structureReport(feature, 'letter');
    expect(report.longestScenes).toHaveLength(5);
    const starts = report.scenes.map((s) => s.startPage);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('reports beats with their page', () => {
    const s = parse('INT. A - DAG\n[[beat: Midpoint]]\n\nx.');
    expect(structureReport(s, 'a4').beats).toEqual([{ beat: 'Midpoint', page: 1, scene: 'INT. A - DAG' }]);
  });
});

describe('schedule groups', () => {
  const script = parse(
    'INT. KÖK - DAG\n\nVILDE\nHej.\n\nEXT. GÅRD - NATT\n\nERIK\nHå.\n\nINT. KÖK - NATT\n\nVILDE\nNatt.',
  );

  it('groups scenes by location, with day/night and cast', () => {
    const groups = scheduleGroups(script, 'a4');
    const kitchen = groups.find((g) => g.location === 'KÖK');
    expect(kitchen?.scenes.map((s) => s.index)).toEqual([0, 2]);
    expect(kitchen).toMatchObject({ day: true, night: true, cast: ['VILDE'] });
  });
});

describe('character lines', () => {
  const script = parse('INT. KÖK - DAG\n\nVILDE\nHej.\n\nERIK\n(tyst)\nHej själv.\n\nVILDE\nSnyggt.');

  it('gives each line with what came before it', () => {
    const lines = characterLines(script, 'erik');
    expect(lines).toEqual([
      { scene: 0, heading: 'INT. KÖK - DAG', text: 'Hej själv.', parenthetical: 'tyst', after: { speaker: 'VILDE', text: 'Hej.' } },
    ]);
  });

  it('finds the lead in a real feature', () => {
    expect(characterLines(feature, 'EDWARD').length).toBeGreaterThan(250);
  });
});
