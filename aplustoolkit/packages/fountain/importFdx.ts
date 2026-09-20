import { parse } from './parse';

/**
 * Final Draft (.fdx) to Fountain.
 *
 * Read with a small extractor rather than a full XML parser: FDX is a flat run
 * of paragraphs, each holding text runs, and that is all the script is. It
 * keeps the import free of a dependency for a format this regular.
 *
 * The one thing that needs care is that Fountain *infers* what a line is from
 * how it looks, while FDX *states* it. A Final Draft Action line that happens
 * to be in capitals would be read back as a character cue. So every block is
 * parsed after it is written, and anything that would be read as something
 * other than what Final Draft said it was is forced with the character
 * Fountain provides for that.
 */

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');

interface Para {
  type: string;
  text: string;
  number?: string;
}

/** Every paragraph inside one chunk of the file, with its text runs joined. */
function paragraphsIn(chunk: string): Para[] {
  const out: Para[] = [];
  for (const match of chunk.matchAll(/<Paragraph\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Paragraph>)/g)) {
    const attrs = match[1] ?? '';
    const type = /\bType="([^"]*)"/.exec(attrs)?.[1] ?? 'Action';
    const number = /\bNumber="([^"]*)"/.exec(attrs)?.[1];
    const runs = [...(match[2] ?? '').matchAll(/<Text\b[^>]*?(?:\/>|>([\s\S]*?)<\/Text>)/g)];
    const text = decode(runs.map((run) => run[1] ?? '').join('')).replace(/\r/g, '');
    out.push({ type: decode(type), text, ...(number ? { number: decode(number) } : {}) });
  }
  return out;
}

const TITLE_KEYS = ['Title', 'Credit', 'Author', 'Source', 'Contact'];

/** The title page as a Fountain title block, when there is one worth writing. */
function titleBlock(chunk: string): string {
  const lines = paragraphsIn(chunk).map((p) => p.text.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  const [title, ...rest] = lines;
  const block = [`Title: ${title}`];
  if (rest.length > 0) block.push(`Author: ${rest[0]}`);
  for (const extra of rest.slice(1)) block.push(`${TITLE_KEYS[Math.min(block.length, TITLE_KEYS.length - 1)] ?? 'Notes'}: ${extra}`);
  return `${block.join('\n')}\n\n`;
}

/** First element a block parses to, so a forced character is only added when needed. */
const readsAs = (block: string) => parse(block).elements.find((e) => e.type !== 'boneyard')?.type;

export function fdxToFountain(xml: string): string {
  const titleChunk = /<TitlePage\b[^>]*>([\s\S]*?)<\/TitlePage>/.exec(xml)?.[1] ?? '';
  const body = xml.replace(/<TitlePage\b[\s\S]*?<\/TitlePage>/, '');
  const paras = paragraphsIn(/<Content\b[^>]*>([\s\S]*)<\/Content>/.exec(body)?.[1] ?? body);

  const blocks: string[] = [];
  let dialogue: string[] | null = null;
  const flush = () => {
    if (dialogue) blocks.push(dialogue.join('\n'));
    dialogue = null;
  };

  for (const para of paras) {
    const text = para.text.replace(/\s*\n\s*/g, ' ').trim();

    if (para.type === 'Character') {
      flush();
      if (!text) continue;
      // Mixed case would be read as action, so it is forced with @.
      dialogue = [text === text.toUpperCase() ? text : `@${text}`];
      continue;
    }

    if ((para.type === 'Dialogue' || para.type === 'Parenthetical') && dialogue) {
      // Line breaks stay (lyrics, verse); only blank lines go, as one would end the block.
      const kept = para.text.split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
      if (kept) dialogue.push(para.type === 'Parenthetical' && !kept.startsWith('(') ? `(${kept})` : kept);
      continue;
    }

    flush();
    if (!text && para.type !== 'Action') continue;

    if (para.type === 'Scene Heading') {
      const heading = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i.test(text) ? text.toUpperCase() : `.${text.toUpperCase()}`;
      blocks.push(para.number ? `${heading} #${para.number}#` : heading);
    } else if (para.type === 'Transition') {
      blocks.push(/^[A-ZÅÄÖ0-9 .'-]+TO:$/.test(text) ? text : `> ${text.replace(/^>\s*/, '')}`);
    } else {
      // Action, General, Shot, and anything Final Draft adds that we do not know.
      const lines = para.text.split('\n').map((line) => line.trimEnd());
      const block = lines.join('\n');
      if (block.trim() === '') {
        blocks.push(''); // a deliberate empty line in the source
      } else {
        blocks.push(readsAs(block) === 'action' ? block : lines.map((line) => (line ? `!${line}` : line)).join('\n'));
      }
    }
  }
  flush();

  return `${titleBlock(titleChunk)}${blocks.join('\n\n')}\n`.replace(/\n{4,}/g, '\n\n\n');
}
