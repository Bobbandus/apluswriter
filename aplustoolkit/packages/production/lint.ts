import { parse } from '../fountain/parse';
import type { Element } from '../fountain/types';

/**
 * Fountain format check.
 *
 * Finds places where a script is *formatted* in a way that another Fountain
 * app would read differently from the writer's intent — a parenthetical
 * stranded under its dialogue, a heading with no blank line after it, a
 * character cue in lower case. Purely mechanical: no AI, and every fix keeps
 * every word exactly as written (`onlyFormattingChanged` enforces that before
 * anything is shown).
 */

export interface LintIssue {
  rule: 'trailingParenthetical' | 'orphanParenthetical' | 'headingSpacing' | 'cueCase' | 'transitionCase';
  title: string;
  explanation: string;
  /** Exact source text to replace, and what replaces it. */
  before: string;
  after: string;
  /** 0-based offset where `before` starts. */
  near: number;
}

const isParen = (raw: string) => /^\(.*\)$/.test(raw.trim());

export function lintScript(source: string, t: (key: LintIssue['rule']) => { title: string; explanation: string }): LintIssue[] {
  const script = parse(source);
  const els = script.elements;
  const issues: LintIssue[] = [];
  const known = new Set(script.characters.map((c) => c.name));

  const at = (i: number): Element | undefined => els[i];

  for (let i = 0; i < els.length; i += 1) {
    const el = els[i] as Element;

    /* A speech that is cue + one line + a trailing parenthetical:
       the parenthetical is almost certainly meant to come first. */
    if (el.type === 'character') {
      const dialogue = at(i + 1);
      const paren = at(i + 2);
      if (dialogue?.type === 'dialogue' && paren?.type === 'parenthetical' && at(i + 3)?.type !== 'dialogue') {
        const before = source.slice(el.from, paren.to);
        const after = `${el.raw}\n${paren.raw}\n${dialogue.raw}`;
        if (before !== after) {
          issues.push({ rule: 'trailingParenthetical', ...t('trailingParenthetical'), before, after, near: el.from });
        }
      }
    }

    /* A parenthetical in its own paragraph straight after a speech: the blank
       line makes it action, so it is read as scene description. */
    if (el.type === 'action' && isParen(el.raw) && !el.raw.includes('\n')) {
      const dialogue = at(i - 1);
      const cue = at(i - 2);
      if (dialogue?.type === 'dialogue' && cue?.type === 'character') {
        const before = source.slice(cue.from, el.to);
        const after = `${cue.raw}\n${el.raw}\n${dialogue.raw}`;
        issues.push({ rule: 'orphanParenthetical', ...t('orphanParenthetical'), before, after, near: cue.from });
      }
    }

    /* A heading with text on the very next line. Other apps need a blank line
       after a heading to recognise it. */
    if (el.type === 'sceneHeading') {
      const next = at(i + 1);
      if (next && next.type !== 'note' && next.lineStart === el.lineEnd + 1) {
        const before = source.slice(el.from, next.from + next.raw.split('\n')[0]!.length);
        const after = `${el.raw}\n\n${before.slice(el.raw.length + 1)}`;
        issues.push({ rule: 'headingSpacing', ...t('headingSpacing'), before, after, near: el.from });
      }
    }

    /* A name that is a known character but typed in lower case, so it reads
       as action. Only when the paragraph continues on the next line (a cue
       needs something under it). */
    if (el.type === 'action' && el.raw.includes('\n')) {
      const [first] = el.raw.split('\n');
      if (first && first === first.trim() && first !== first.toUpperCase() && known.has(first.toUpperCase())) {
        issues.push({
          rule: 'cueCase',
          ...t('cueCase'),
          before: first,
          after: first.toUpperCase(),
          near: el.from,
        });
      }
    }

    /* "Cut to:" in mixed case is action to every other app. */
    if (el.type === 'action' && /^(cut|dissolve|smash cut|match cut|fade|jump cut) to:$/i.test(el.raw.trim()) && el.raw.trim() !== el.raw.trim().toUpperCase()) {
      issues.push({ rule: 'transitionCase', ...t('transitionCase'), before: el.raw.trim(), after: el.raw.trim().toUpperCase(), near: el.from });
    }
  }

  return issues.sort((a, b) => a.near - b.near);
}
