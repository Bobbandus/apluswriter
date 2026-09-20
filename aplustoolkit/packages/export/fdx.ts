import type { Script, TitlePageField } from '../fountain/types';

/**
 * Final Draft (.fdx) export.
 *
 * FDX is XML: a list of paragraphs, each with a type Final Draft already knows
 * (Scene Heading, Action, Character, Dialogue, Parenthetical, Transition) and
 * a run of text. That maps almost one to one from the parse, which is why the
 * file is built from the parsed script rather than from the source text.
 *
 * What is left out is deliberate. Sections, synopses, notes and boneyard are
 * the writer's working material, not the script: notes are how A+ keeps its own
 * metadata, and parked scene alternatives live in boneyard, so none of it may
 * reach a producer. Inline emphasis (bold, italic, underline) is not carried
 * across yet; the words are exact, the styling is not.
 */

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A line break inside one element becomes a space: FDX has no soft break in a paragraph. */
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim();

function paragraph(type: string, text: string, attributes: Record<string, string> = {}): string {
  const attrs = Object.entries({ Type: type, ...attributes })
    .map(([name, value]) => ` ${name}="${escape(value)}"`)
    .join('');
  return `    <Paragraph${attrs}><Text>${escape(text)}</Text></Paragraph>`;
}

/** Action can run over several lines, and each becomes its own paragraph, as Final Draft writes it. */
function actionLines(text: string, attributes: Record<string, string> = {}): string[] {
  return text.split('\n').map((line) => paragraph('Action', line, attributes));
}

function titlePage(fields: TitlePageField[]): string {
  if (fields.length === 0) return '';
  const left = new Set(['contact', 'kontakt', 'notes', 'copyright', 'upphovsrätt', 'draft date', 'date', 'datum']);
  const lines = fields.flatMap((field) =>
    field.values.map((value) =>
      `      <Paragraph${left.has(field.key) ? '' : ' Alignment="Center"'}><Text>${escape(value)}</Text></Paragraph>`,
    ),
  );
  return `  <TitlePage>\n    <Content>\n${lines.join('\n')}\n    </Content>\n  </TitlePage>\n`;
}

export function renderFdx(script: Script): string {
  const body: string[] = [];

  for (const element of script.elements) {
    switch (element.type) {
      case 'sceneHeading':
        body.push(paragraph('Scene Heading', oneLine(element.text), element.sceneNumber ? { Number: element.sceneNumber } : {}));
        break;
      case 'action':
        body.push(...actionLines(element.text));
        break;
      case 'character':
        body.push(paragraph('Character', oneLine([element.name, ...element.extensions].join(' '))));
        break;
      case 'dialogue':
        body.push(paragraph('Dialogue', oneLine(element.text)));
        break;
      case 'parenthetical':
        body.push(paragraph('Parenthetical', oneLine(element.text)));
        break;
      case 'transition':
        body.push(paragraph('Transition', oneLine(element.text)));
        break;
      case 'centered':
        body.push(...actionLines(element.text, { Alignment: 'Center' }));
        break;
      case 'lyrics':
        body.push(...actionLines(element.text));
        break;
      // Working material, never script: see the note at the top of the file.
      default:
        break;
    }
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n` +
    `<FinalDraft DocumentType="Script" Template="No" Version="5">\n` +
    `  <Content>\n${body.join('\n')}\n  </Content>\n` +
    titlePage(script.titlePage?.fields ?? []) +
    `</FinalDraft>\n`
  );
}
