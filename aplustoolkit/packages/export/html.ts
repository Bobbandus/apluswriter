import type { Script } from '../fountain/types';

/**
 * A screenplay as one self-contained HTML page.
 *
 * For reading on a phone, pasting into an email, or opening where nobody has
 * a screenwriting app. One file, styles inline, nothing fetched: it has to
 * still work when it is forwarded three times.
 *
 * As with Final Draft export, working material never leaves: notes, sections,
 * synopses and boneyard (where parked scene alternatives live) are left out.
 */

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
  body { margin: 0; background: #f4f2ec; color: #111; }
  main { max-width: 6.5in; margin: 2rem auto; padding: 1in 1in 1.5in 1.5in; background: #fff;
         font: 12pt/1.15 "Courier Prime", "Courier New", Courier, monospace; box-shadow: 0 1px 6px rgb(0 0 0 / .15); }
  h1 { font: inherit; text-align: center; text-transform: uppercase; margin: 2in 0 0; }
  .title-page p { text-align: center; margin: 0 0 1em; }
  .title-page { min-height: 8in; border-bottom: 1px dashed #bbb; margin-bottom: 1in; }
  p { margin: 0 0 1em; white-space: pre-wrap; }
  .heading { text-transform: uppercase; font-weight: bold; margin-top: 2em; }
  .character { margin: 1em 0 0 2.2in; text-transform: uppercase; }
  .parenthetical { margin: 0 0 0 1.6in; }
  .dialogue { margin: 0 1in 1em 1in; }
  .transition { text-align: right; text-transform: uppercase; }
  .centered { text-align: center; }
  @media (max-width: 7in) { main { padding: 1rem; margin: 0; }
    .character, .parenthetical, .dialogue { margin-left: 1rem; margin-right: 0; } }
`;

export function renderHtml(script: Script, title = 'Manus'): string {
  const parts: string[] = [];

  const fields = script.titlePage?.fields ?? [];
  if (fields.length > 0) {
    const [first, ...rest] = fields.flatMap((field) => field.values);
    parts.push(
      `<section class="title-page"><h1>${escape(first ?? '')}</h1>${rest.map((value) => `<p>${escape(value)}</p>`).join('')}</section>`,
    );
  }

  for (const element of script.elements) {
    switch (element.type) {
      case 'sceneHeading':
        parts.push(`<p class="heading">${escape(element.sceneNumber ? `${element.sceneNumber}  ${element.text}` : element.text)}</p>`);
        break;
      case 'action':
      case 'lyrics':
        parts.push(`<p>${escape(element.text)}</p>`);
        break;
      case 'character':
        parts.push(`<p class="character">${escape([element.name, ...element.extensions].join(' '))}</p>`);
        break;
      case 'parenthetical':
        parts.push(`<p class="parenthetical">${escape(element.text)}</p>`);
        break;
      case 'dialogue':
        parts.push(`<p class="dialogue">${escape(element.text)}</p>`);
        break;
      case 'transition':
        parts.push(`<p class="transition">${escape(element.text)}</p>`);
        break;
      case 'centered':
        parts.push(`<p class="centered">${escape(element.text)}</p>`);
        break;
      default:
        break;
    }
  }

  return (
    `<!doctype html>\n<html lang="sv">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${escape(title)}</title>\n<style>${CSS}</style>\n</head>\n<body>\n<main>\n${parts.join('\n')}\n</main>\n</body>\n</html>\n`
  );
}
