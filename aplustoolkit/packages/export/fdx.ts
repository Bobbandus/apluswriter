import type { Element, Script, TitlePageField } from '../fountain/types';

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
 * reach a producer. Bold, italic and underline are carried as styled runs.
 */

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A line break inside one element becomes a space: FDX has no soft break in a paragraph. */
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim();

/** A stretch of text with one style, as Final Draft stores it: `Bold+Italic+Underline`, or none. */
export interface Run {
  text: string;
  style: string;
}

/**
 * The element's text as styled runs, read from the emphasis spans.
 *
 * Every delimiter is dropped (`**`, `_`) and notes vanish entirely, exactly as in the plain text.
 * The result is checked against that plain text and abandoned for it if they differ in any
 * way, so a style can be lost but a word never can.
 */
export function runsOf(element: Element): Run[] {
  const plain = [{ text: element.text, style: '' }];
  const raw = element.raw;
  const drop = new Array<boolean>(raw.length).fill(false);
  const bold = new Array<boolean>(raw.length).fill(false);
  const italic = new Array<boolean>(raw.length).fill(false);
  const underline = new Array<boolean>(raw.length).fill(false);
  const mark = (flags: boolean[], from: number, to: number) => {
    for (let i = Math.max(0, from); i < Math.min(raw.length, to); i++) flags[i] = true;
  };

  for (const span of element.spans) {
    const a = span.from - element.from;
    const b = span.to - element.from;
    if (span.type === 'note' || span.type === 'tag') {
      mark(drop, a, b);
      continue;
    }
    const ca = span.contentFrom - element.from;
    const cb = span.contentTo - element.from;
    mark(drop, a, ca);
    mark(drop, cb, b);
    if (span.type === 'bold' || span.type === 'boldItalic') mark(bold, ca, cb);
    if (span.type === 'italic' || span.type === 'boldItalic') mark(italic, ca, cb);
    if (span.type === 'underline') mark(underline, ca, cb);
  }

  const runs: Run[] = [];
  let built = '';
  for (let i = 0; i < raw.length; i++) {
    if (drop[i]) continue;
    const style = [bold[i] ? 'Bold' : '', italic[i] ? 'Italic' : '', underline[i] ? 'Underline' : ''].filter(Boolean).join('+');
    built += raw[i];
    const last = runs[runs.length - 1];
    if (last && last.style === style) last.text += raw[i];
    else runs.push({ text: raw[i] as string, style });
  }

  // A forced element (`!Action`, `@Name`) carries a marker in front that the plain text lacks.
  if (!built.endsWith(element.text)) return plain;
  let extra = built.length - element.text.length;
  while (extra > 0 && runs.length > 0) {
    const first = runs[0]!;
    if (first.text.length <= extra) {
      extra -= first.text.length;
      runs.shift();
    } else {
      first.text = first.text.slice(extra);
      extra = 0;
    }
  }
  return runs.length > 0 ? runs : plain;
}

/** Runs cut at each line break, as Final Draft wants one paragraph per line of action. */
function runLines(runs: Run[]): Run[][] {
  const lines: Run[][] = [[]];
  for (const run of runs) {
    run.text.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ text: part, style: run.style });
    });
  }
  return lines;
}

/** Runs with each line break made a space, and the ends trimmed, for elements that are one paragraph. */
function oneLineRuns(runs: Run[]): Run[] {
  const flat = runs.map((run) => ({ text: run.text.replace(/\s*\n\s*/g, ' '), style: run.style }));
  if (flat[0]) flat[0].text = flat[0].text.trimStart();
  const last = flat[flat.length - 1];
  if (last) last.text = last.text.trimEnd();
  return flat.filter((run) => run.text !== '');
}

const textElements = (runs: Run[]) =>
  runs.length === 0
    ? '<Text></Text>'
    : runs.map((run) => `<Text${run.style ? ` Style="${run.style}"` : ''}>${escape(run.text)}</Text>`).join('');

function paragraph(type: string, text: string | Run[], attributes: Record<string, string> = {}): string {
  const attrs = Object.entries({ Type: type, ...attributes })
    .map(([name, value]) => ` ${name}="${escape(value)}"`)
    .join('');
  const runs = typeof text === 'string' ? [{ text, style: '' }] : text;
  return `    <Paragraph${attrs}>${textElements(runs)}</Paragraph>`;
}

/** Action can run over several lines, and each becomes its own paragraph, as Final Draft writes it. */
function actionLines(element: Element, attributes: Record<string, string> = {}): string[] {
  return runLines(runsOf(element)).map((line) => paragraph('Action', line, attributes));
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

/** Where one speech (a cue and its lines) sits in the list of paragraphs. */
interface Speech {
  start: number;
  end: number;
  dual: boolean;
}

/**
 * Final Draft keeps two speeches that print side by side inside one `DualDialogue` wrapper.
 * Each pair is folded into a single entry; walking from the end keeps the earlier indexes valid.
 */
function foldDual(body: string[], speeches: Speech[]): void {
  for (let i = speeches.length - 1; i > 0; i--) {
    const speech = speeches[i]!;
    const before = speeches[i - 1]!;
    if (!speech.dual || before.end !== speech.start) continue;
    const inner = body.slice(before.start, speech.end).join('\n');
    body.splice(before.start, speech.end - before.start, `    <Paragraph><DualDialogue>\n${inner}\n    </DualDialogue></Paragraph>`);
  }
}

export function renderFdx(script: Script): string {
  const body: string[] = [];
  const speeches: Speech[] = [];

  for (const element of script.elements) {
    switch (element.type) {
      case 'sceneHeading':
        body.push(paragraph('Scene Heading', oneLine(element.text), element.sceneNumber ? { Number: element.sceneNumber } : {}));
        break;
      case 'action':
        body.push(...actionLines(element));
        break;
      case 'character':
        speeches.push({ start: body.length, end: body.length + 1, dual: element.dual });
        body.push(paragraph('Character', oneLine([element.name, ...element.extensions].join(' '))));
        break;
      case 'dialogue':
        body.push(paragraph('Dialogue', oneLineRuns(runsOf(element))));
        if (speeches.length > 0) speeches[speeches.length - 1]!.end = body.length;
        break;
      case 'parenthetical':
        body.push(paragraph('Parenthetical', oneLineRuns(runsOf(element))));
        if (speeches.length > 0) speeches[speeches.length - 1]!.end = body.length;
        break;
      case 'transition':
        body.push(paragraph('Transition', oneLine(element.text)));
        break;
      case 'centered':
        body.push(...actionLines(element, { Alignment: 'Center' }));
        break;
      case 'lyrics':
        body.push(...actionLines(element));
        break;
      // Working material, never script: see the note at the top of the file.
      default:
        break;
    }
  }

  foldDual(body, speeches);

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n` +
    `<FinalDraft DocumentType="Script" Template="No" Version="5">\n` +
    `  <Content>\n${body.join('\n')}\n  </Content>\n` +
    titlePage(script.titlePage?.fields ?? []) +
    `</FinalDraft>\n`
  );
}
