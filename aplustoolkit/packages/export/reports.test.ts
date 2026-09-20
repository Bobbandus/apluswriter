import { describe, expect, it } from 'vitest';
import { parse } from '../fountain/parse';
import { renderHtml } from './html';
import { characterReport, locationReport, renderReport, sceneReport } from './reports';

const SCRIPT = [
  'INT. KÖK - DAG',
  '',
  '= Erik lagar middag; det går dåligt.',
  '',
  'ERIK',
  'Hej på dig.',
  '',
  'VILDE',
  'Bra.',
  '',
  'EXT. GATA - NATT',
  '',
  'ERIK',
  'Det regnar.',
  '',
].join('\n');

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

describe('reports', () => {
  it('starts with a byte-order mark, so a Swedish Excel opens å, ä and ö correctly', () => {
    for (const kind of ['scenes', 'characters', 'locations'] as const) {
      expect(renderReport(kind, parse(SCRIPT)).charCodeAt(0)).toBe(0xfeff);
    }
  });

  it('lists every scene with its place, time and speakers', () => {
    const [header, first, second] = lines(sceneReport(parse(SCRIPT), [4, 2]));
    expect(header).toBe('Scen;Rubrik;Plats;Tid;Roller;Åttondelar;Synopsis');
    // A comma is not a separator here, so it needs no quotes.
    expect(first).toContain('INT. KÖK - DAG;KÖK;DAG;ERIK, VILDE;4');
    expect(second).toContain('EXT. GATA - NATT;GATA;NATT;ERIK;2');
  });

  // A synopsis with a semicolon in it must not turn into two columns.
  it('quotes a field that would break the row', () => {
    expect(lines(sceneReport(parse(SCRIPT)))[1]).toContain('"Erik lagar middag; det går dåligt."');
  });

  it('leaves the length blank rather than making one up', () => {
    expect(lines(sceneReport(parse(SCRIPT)))[1]).toMatch(/;;"Erik lagar/);
  });

  it('counts lines, words and scenes per role', () => {
    expect(lines(characterReport(parse(SCRIPT))).slice(1)).toEqual([
      'ERIK;2;5;2;INT. KÖK - DAG',
      'VILDE;1;1;1;INT. KÖK - DAG',
    ]);
  });

  it('lists locations alphabetically, one row each', () => {
    expect(lines(locationReport(parse(SCRIPT))).slice(1)).toEqual(['GATA;EXT.;NATT;1', 'KÖK;INT.;DAG;1']);
  });
});

describe('HTML export', () => {
  const html = (source: string) => renderHtml(parse(source), 'Test');

  it('is one self-contained page, with no external requests', () => {
    const out = html(SCRIPT);
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('<style>');
    expect(out).not.toMatch(/<link |<script|src="http/i);
  });

  it('escapes markup, so a line that looks like a tag stays text', () => {
    const out = html('INT. A - DAG\n\nHan skriver <b>hej</b> & går.');
    expect(out).toContain('Han skriver &lt;b&gt;hej&lt;/b&gt; &amp; går.');
    expect(out).not.toContain('<b>hej</b>');
  });

  it('never carries working material out', () => {
    const out = html('# Akt I\n\nINT. A - DAG\n[[CAST: Vilde]]\n\n= Synopsis.\n\nEtt.\n\n/* aplus:alt Gammal\nHemlig scen.\n*/\n');
    for (const secret of ['CAST', 'Synopsis', 'Hemlig', 'aplus:alt', 'Akt I']) expect(out).not.toContain(secret);
    expect(out).toContain('Ett.');
  });

  it('keeps a role with its extension and puts the scene number on the heading', () => {
    const out = html('INT. A - DAG #4#\n\nERIK (V.O.)\nHej.');
    expect(out).toContain('ERIK (V.O.)');
    expect(out).toContain('4  INT. A - DAG');
  });
});
