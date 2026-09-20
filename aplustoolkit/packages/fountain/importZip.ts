import { strFromU8, unzipSync } from 'fflate';
import { parse } from './parse';

/**
 * Highland and Word files, both zip archives, to Fountain.
 *
 * Highland is the easy one: the script is already Fountain inside the zip.
 * Word is a best effort. A .docx says how a paragraph *looks* (indent, case),
 * not what it *is*, so the classification below is a set of guesses that are
 * right for the usual "screenplay typed in Word" and wrong for the unusual. It
 * only ever produces a new project, so a wrong guess costs a minute of tidying
 * and never touches an existing script.
 */

const decodeEntities = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');

/** Files in an archive, without the resource-fork clutter Macs add. */
function unpack(bytes: Uint8Array): Record<string, Uint8Array> {
  const files = unzipSync(bytes);
  for (const name of Object.keys(files)) {
    if (name.startsWith('__MACOSX/') || /(^|\/)\._/.test(name) || name.endsWith('/')) delete files[name];
  }
  return files;
}

export function highlandToFountain(bytes: Uint8Array): string {
  const files = unpack(bytes);
  const names = Object.keys(files);
  // Highland 2 keeps the script in text.md; older files name it after the script.
  const name =
    names.find((n) => /(^|\/)text\.(md|fountain)$/i.test(n)) ??
    names.find((n) => /\.fountain$/i.test(n)) ??
    names.find((n) => /\.(md|txt)$/i.test(n));
  const file = name ? files[name] : undefined;
  if (!file) throw new Error('No script found in the Highland file');
  return strFromU8(file).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

interface DocPara {
  text: string;
  /** Left indent in twips; 0 when there is none. */
  indent: number;
}

/** Paragraphs of word/document.xml, in order, with their runs joined. */
function docxParagraphs(xml: string): DocPara[] {
  const out: DocPara[] = [];
  for (const match of xml.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const body = match[1] ?? '';
    const indent = Number(/<w:ind\b[^>]*\bw:(?:left|start)="(\d+)"/.exec(body)?.[1] ?? 0);
    let text = '';
    for (const part of body.matchAll(/<w:t\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:t>)|<w:tab\s*\/>|<w:br\b[^>]*\/>/g)) {
      text += part[0].startsWith('<w:tab') ? ' ' : part[0].startsWith('<w:br') ? '\n' : decodeEntities(part[1] ?? '');
    }
    out.push({ text: text.replace(/ /g, ' ').trim(), indent });
  }
  return out;
}

const HEADING = /^(?:INT|EXT|EST|I\/E|INT\.?\/EXT)[. ]/i;
const isUpper = (text: string) => /[A-ZÅÄÖ]/.test(text) && text === text.toUpperCase();
const isTransition = (text: string) => isUpper(text) && /TO:$/.test(text);
const looksLikeCue = (text: string) => isUpper(text) && text.length <= 32 && text.split(/\s+/).length <= 5 && !HEADING.test(text) && !isTransition(text) && !text.includes('\n');

/** A block written so Fountain reads it as the action it is, not as whatever its look suggests. */
function asAction(text: string): string {
  const lines = text.split('\n');
  const first = parse(text).elements.find((e) => e.type !== 'boneyard')?.type;
  return first === 'action' ? text : lines.map((line) => (line ? `!${line}` : line)).join('\n');
}

export function docxToFountain(bytes: Uint8Array): string {
  const document = unpack(bytes)['word/document.xml'];
  if (!document) throw new Error('Not a Word document');

  const paras = docxParagraphs(strFromU8(document)).filter((p) => p.text !== '');
  // When the file carries indents at all, they say who is speaking; without
  // them the best available signal is capitals followed by text.
  const hasIndent = paras.some((p) => p.indent > 0);
  const blocks: string[] = [];

  for (let i = 0; i < paras.length; i++) {
    const para = paras[i]!;
    const next = paras[i + 1];

    if (HEADING.test(para.text)) {
      blocks.push(para.text.toUpperCase());
    } else if (isTransition(para.text)) {
      blocks.push(para.text);
    } else if (
      looksLikeCue(para.text) &&
      next &&
      !HEADING.test(next.text) &&
      (hasIndent ? para.indent > 0 || next.indent > 0 : !isUpper(next.text) || next.text.startsWith('('))
    ) {
      const cue = para.text === para.text.toUpperCase() ? para.text : `@${para.text}`;
      const speech = [cue];
      let j = i + 1;
      // Parentheticals, then the speech; with indents, every following indented paragraph belongs to it.
      while (j < paras.length && paras[j]!.text.startsWith('(')) speech.push(paras[j++]!.text);
      if (j < paras.length) {
        speech.push(paras[j]!.text.replace(/\s*\n\s*/g, '\n'));
        j++;
        while (hasIndent && j < paras.length && paras[j]!.indent > 0 && !looksLikeCue(paras[j]!.text)) speech.push(paras[j++]!.text);
      }
      blocks.push(speech.join('\n'));
      i = j - 1;
    } else {
      blocks.push(asAction(para.text));
    }
  }

  return `${blocks.join('\n\n')}\n`;
}
