import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../fountain/parse';
import { renderFdx } from './fdx';

const fdx = (source: string) => renderFdx(parse(source));

/** The paragraphs as [type, text], in order, so a whole script reads as a list. */
function paragraphs(xml: string): [string, string][] {
  const content = xml.split('<Content>')[1]?.split('</Content>')[0] ?? '';
  return [...content.matchAll(/<Paragraph[^>]*Type="([^"]+)"[^>]*><Text>([\s\S]*?)<\/Text><\/Paragraph>/g)].map((m) => [
    m[1] as string,
    (m[2] as string).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
  ]);
}

describe('FDX export', () => {
  const SCRIPT = [
    'INT. KÖK - DAG',
    '',
    'Erik lagar mat.',
    '',
    'ERIK (V.O.)',
    '(tyst)',
    'Hej, hur är läget?',
    '',
    'CUT TO:',
    '',
  ].join('\n');

  it('maps each element to the Final Draft paragraph type it belongs to, in order', () => {
    expect(paragraphs(fdx(SCRIPT))).toEqual([
      ['Scene Heading', 'INT. KÖK - DAG'],
      ['Action', 'Erik lagar mat.'],
      ['Character', 'ERIK (V.O.)'],
      ['Parenthetical', '(tyst)'],
      ['Dialogue', 'Hej, hur är läget?'],
      ['Transition', 'CUT TO:'],
    ]);
  });

  it('is an FDX document', () => {
    const xml = fdx(SCRIPT);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"')).toBe(true);
    expect(xml).toContain('<FinalDraft DocumentType="Script"');
    expect(xml.trimEnd().endsWith('</FinalDraft>')).toBe(true);
  });

  it('escapes what XML cannot hold, so a title with an ampersand does not break the file', () => {
    const xml = fdx('INT. A - DAG\n\nBRICK & STEEL <sic> säger "hej".');
    expect(xml).toContain('BRICK &amp; STEEL &lt;sic&gt; säger &quot;hej&quot;.');
    expect(paragraphs(xml)[1]).toEqual(['Action', 'BRICK & STEEL <sic> säger "hej".']);
  });

  it('carries the scene number', () => {
    expect(fdx('INT. A - DAG #12#\n\nEtt.')).toContain('Number="12"');
  });

  // Notes are how A+ keeps its own metadata and boneyard holds parked scene
  // alternatives. Neither may reach a producer.
  it('leaves out notes, sections, synopses and boneyard', () => {
    const xml = fdx('# Akt I\n\nINT. A - DAG\n[[CAST: Vilde]]\n\n= En synopsis.\n\nEtt.\n\n/* aplus:alt Gammal\nINT. A - DAG\n\nHemlig.\n*/\n');
    expect(paragraphs(xml)).toEqual([['Scene Heading', 'INT. A - DAG'], ['Action', 'Ett.']]);
    for (const secret of ['CAST', 'synopsis', 'Hemlig', 'aplus:alt', 'Akt I']) expect(xml).not.toContain(secret);
  });

  it('writes each line of an action block as its own paragraph', () => {
    expect(paragraphs(fdx('INT. A - DAG\n\nFörsta raden.\nAndra raden.')).slice(1)).toEqual([
      ['Action', 'Första raden.'],
      ['Action', 'Andra raden.'],
    ]);
  });

  it('centres a centred line', () => {
    expect(fdx('INT. A - DAG\n\n> SLUT <')).toContain('Alignment="Center"');
  });

  it('writes the title page', () => {
    const xml = fdx('Title: Min film\nAuthor: Vilde\n\nINT. A - DAG\n\nEtt.');
    expect(xml).toContain('<TitlePage>');
    expect(xml).toContain('<Text>Min film</Text>');
    expect(xml).toContain('<Text>Vilde</Text>');
  });

  it('has as many closing tags as opening ones, on a whole feature', () => {
    const xml = renderFdx(parse(readFileSync(join(process.cwd(), 'fixtures/official/Big-Fish.fountain'), 'utf8')));
    expect((xml.match(/<Paragraph[ >]/g) ?? []).length).toBe((xml.match(/<\/Paragraph>/g) ?? []).length);
    expect((xml.match(/<Text>/g) ?? []).length).toBe((xml.match(/<\/Text>/g) ?? []).length);
    expect(paragraphs(xml).length).toBeGreaterThan(1000);
  });
});
