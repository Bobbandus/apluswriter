import { Fragment, type ReactNode } from 'react';

/**
 * Just enough Markdown for what an assistant writes back: headings, bullets,
 * numbered lists, bold, italics and paragraphs.
 *
 * Built from React nodes rather than injected HTML, so text that arrives from
 * outside the app can never carry markup into the page.
 */

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = m[0];
    if (token.startsWith('**')) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(4, (heading[1] ?? '#').length);
      const Tag = (`h${level + 2}` as 'h3' | 'h4' | 'h5' | 'h6');
      blocks.push(<Tag key={key++} style={{ margin: '12px 0 4px', fontSize: 'var(--t-body)' }}>{inline(heading[2] ?? '')}</Tag>);
      i += 1;
      continue;
    }

    if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && (/^\s*[-*•]\s+/.test(lines[i] ?? '') || /^\s*\d+[.)]\s+/.test(lines[i] ?? ''))) {
        items.push(<li key={items.length}>{inline((lines[i] ?? '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))}</li>);
        i += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={key++} style={{ margin: '4px 0', paddingLeft: '1.3em', listStyle: ordered ? 'decimal' : 'disc' }}>{items}</List>);
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() && !/^(#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s)/.test(lines[i] ?? '')) {
      paragraph.push(lines[i] ?? '');
      i += 1;
    }
    blocks.push(<p key={key++} style={{ margin: '4px 0' }}>{inline(paragraph.join(' '))}</p>);
  }

  return <div style={{ fontSize: 'var(--t-small)', lineHeight: 1.55 }}>{blocks.map((b, n) => <Fragment key={n}>{b}</Fragment>)}</div>;
}
