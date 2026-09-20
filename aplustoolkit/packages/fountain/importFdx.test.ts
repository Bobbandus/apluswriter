import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderFdx } from '../export/fdx';
import { fdxToFountain } from './importFdx';
import { parse } from './parse';

const wrap = (paragraphs: string) =>
  `<?xml version="1.0"?><FinalDraft DocumentType="Script"><Content>${paragraphs}</Content></FinalDraft>`;
const p = (type: string, text: string, extra = '') =>
  `<Paragraph Type="${type}"${extra}><Text>${text}</Text></Paragraph>`;

/** Element types and texts, for comparing two scripts by what they say. */
const shape = (source: string) =>
  parse(source)
    .elements.filter((e) => ['sceneHeading', 'action', 'character', 'dialogue', 'parenthetical', 'transition'].includes(e.type))
    .map((e) => [e.type, e.text.trim()] as const);

describe('Final Draft import', () => {
  it('reads each paragraph type into the Fountain that means the same', () => {
    const out = fdxToFountain(
      wrap(
        p('Scene Heading', 'INT. KÖK - DAG') +
          p('Action', 'Erik lagar mat.') +
          p('Character', 'ERIK') +
          p('Parenthetical', '(tyst)') +
          p('Dialogue', 'Hej.') +
          p('Transition', 'CUT TO:'),
      ),
    );
    expect(shape(out)).toEqual([
      ['sceneHeading', 'INT. KÖK - DAG'],
      ['action', 'Erik lagar mat.'],
      ['character', 'ERIK'],
      ['parenthetical', '(tyst)'],
      ['dialogue', 'Hej.'],
      ['transition', 'CUT TO:'],
    ]);
  });

  it('keeps a cue with its dialogue as one block', () => {
    const out = fdxToFountain(wrap(p('Character', 'ERIK') + p('Dialogue', 'Ett.') + p('Character', 'VILDE') + p('Dialogue', 'Två.')));
    expect(out).toBe('ERIK\nEtt.\n\nVILDE\nTvå.\n');
  });

  it('decodes XML entities and joins a paragraph split over several text runs', () => {
    const out = fdxToFountain(wrap(`<Paragraph Type="Action"><Text>BRICK &amp; STEEL </Text><Text>&lt;sic&gt; s&#228;ger &quot;hej&quot;.</Text></Paragraph>`));
    expect(shape(out)[0]).toEqual(['action', 'BRICK & STEEL <sic> säger "hej".']);
  });

  // Fountain infers; Final Draft states. An Action line in capitals would be
  // read back as a character cue, so it has to be forced to stay Action.
  it('keeps a capitalised action line an action line', () => {
    const out = fdxToFountain(wrap(p('Action', 'SMASH') + p('Action', 'Han går.')));
    expect(shape(out).map(([type]) => type)).toEqual(['action', 'action']);
  });

  it('prefixes a heading that does not start with INT or EXT, and keeps the scene number', () => {
    expect(fdxToFountain(wrap(p('Scene Heading', 'Hos Erik', ' Number="7"')))).toBe('.HOS ERIK #7#\n');
    expect(parse(fdxToFountain(wrap(p('Scene Heading', 'INT. A - DAG', ' Number="12"')))).scenes[0]?.sceneNumber).toBe('12');
  });

  it('forces a character written in mixed case, so it is still a character', () => {
    expect(shape(fdxToFountain(wrap(p('Character', 'Erik') + p('Dialogue', 'Hej.')))).map(([type]) => type)).toEqual(['character', 'dialogue']);
  });

  it('turns a transition that is not "TO:" into a forced one', () => {
    expect(shape(fdxToFountain(wrap(p('Transition', 'Fade Out.'))))[0]).toEqual(['transition', 'Fade Out.']);
  });

  it('writes the title page as a Fountain title block', () => {
    const xml = `<FinalDraft><Content>${p('Action', 'x')}</Content><TitlePage><Content><Paragraph><Text>Min film</Text></Paragraph><Paragraph><Text>Vilde</Text></Paragraph></Content></TitlePage></FinalDraft>`;
    expect(parse(fdxToFountain(xml)).titlePage?.fields.map((f) => [f.key, f.values[0]])).toEqual([
      ['title', 'Min film'],
      ['author', 'Vilde'],
    ]);
  });

  // The strongest check available without Final Draft itself: what this app
  // writes as FDX must read back as the same script.
  it('reads back what the FDX export wrote, on a whole feature', () => {
    const original = readFileSync(join(process.cwd(), 'fixtures/official/Big-Fish.fountain'), 'utf8');
    const back = fdxToFountain(renderFdx(parse(original)));
    const before = shape(original);
    const after = shape(back);
    const only = (rows: typeof before, type: string) => rows.filter(([t]) => t === type).map(([, x]) => x);
    // Same speakers and headings in the same order, which is what a script *is*.
    expect(only(after, 'character')).toEqual(only(before, 'character'));
    expect(only(after, 'sceneHeading')).toEqual(only(before, 'sceneHeading'));
    // Both the emphasis marks and the line breaks inside a speech are lost by the FDX export, on purpose
    // (FDX has no soft break; emphasis is not carried yet), so they are set aside here.
    const plain = (rows: typeof before) => only(rows, 'dialogue').map((x) => x.replace(/\*/g, '').replace(/\s+/g, ' '));
    expect(plain(after)).toEqual(plain(before));
  }, 60_000);
});
