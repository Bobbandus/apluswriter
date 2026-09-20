import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { docxToFountain, highlandToFountain } from './importZip';
import { parse } from './parse';

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));

const para = (text: string, indent = 0) =>
  `<w:p><w:pPr>${indent ? `<w:ind w:left="${indent}"/>` : ''}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const docx = (...paras: string[]) =>
  zip({ 'word/document.xml': `<?xml version="1.0"?><w:document><w:body>${paras.join('')}</w:body></w:document>` });

const types = (source: string) =>
  parse(source)
    .elements.filter((e) => ['sceneHeading', 'action', 'character', 'dialogue', 'parenthetical', 'transition'].includes(e.type))
    .map((e) => [e.type, e.text] as const);

describe('Highland import', () => {
  it('reads text.md from a Highland 2 file', () => {
    expect(highlandToFountain(zip({ 'text.md': 'INT. KÖK - DAG\r\n\r\nERIK\r\nHej.\r\n', 'info.json': '{}' }))).toBe('INT. KÖK - DAG\n\nERIK\nHej.\n');
  });

  it('falls back to a .fountain file, and ignores Mac resource forks', () => {
    const bytes = zip({ '__MACOSX/._film.fountain': 'skräp', 'film.fountain': 'INT. A - DAG\n\nHej.' });
    expect(highlandToFountain(bytes)).toBe('INT. A - DAG\n\nHej.');
  });

  it('says so when there is no script in the file', () => {
    expect(() => highlandToFountain(zip({ 'image.png': 'x' }))).toThrow(/No script/);
  });
});

describe('Word import', () => {
  it('finds headings, cues, parentheticals and speech in a plain typed script', () => {
    const out = docxToFountain(
      docx(
        para('INT. KÖK - DAG'),
        para('Erik lagar mat.'),
        para('ERIK'),
        para('(tyst)'),
        para('Hej på dig.'),
        para('Han går ut.'),
      ),
    );
    expect(types(out)).toEqual([
      ['sceneHeading', 'INT. KÖK - DAG'],
      ['action', 'Erik lagar mat.'],
      ['character', 'ERIK'],
      ['parenthetical', '(tyst)'],
      ['dialogue', 'Hej på dig.'],
      ['action', 'Han går ut.'],
    ]);
  });

  it('uses indents, when the file has them, to tell speech from action', () => {
    const out = docxToFountain(
      docx(para('EXT. GATA - NATT'), para('SMASH CUT'), para('Regn.'), para('VILDE', 4000), para('Ett.', 2000), para('Två.', 2000), para('Hon går.')),
    );
    // Two indented paragraphs are one speech, which Fountain keeps together.
    expect(types(out).map(([type]) => type)).toEqual(['sceneHeading', 'action', 'action', 'character', 'dialogue', 'action']);
    // A capitalised action line is not a cue, and is kept an action line.
    expect(types(out)[1]).toEqual(['action', 'SMASH CUT']);
  });

  it('decodes entities and joins runs and tabs within one paragraph', () => {
    const xml = `<w:p><w:r><w:t>BRICK &amp; </w:t></w:r><w:r><w:t>STEEL</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>går.</w:t></w:r></w:p>`;
    const out = docxToFountain(zip({ 'word/document.xml': `<w:document><w:body>${xml}</w:body></w:document>` }));
    expect(types(out)[0]).toEqual(['action', 'BRICK & STEEL går.']);
  });

  it('keeps transitions as transitions', () => {
    expect(types(docxToFountain(docx(para('INT. A - DAG'), para('Ett.'), para('CUT TO:'))))[2]).toEqual(['transition', 'CUT TO:']);
  });

  it('refuses a zip that is not a Word document', () => {
    expect(() => docxToFountain(zip({ 'other.txt': 'x' }))).toThrow(/Word/);
  });
});
