import type { Element, Script, TitlePage } from './types';

/**
 * AST → Fountain text.
 *
 * The rule here is that an element's `raw` *is* its serialized form. The
 * parser keeps `raw` verbatim, so serializing is a matter of joining elements
 * with the right blank lines rather than reconstructing markup from parts.
 *
 * That choice is what makes round-tripping safe. Rebuilding a scene heading
 * from `prefix + location + timeOfDay` would quietly normalise a writer's
 * `INT.HOUSE--DAY` into `INT. HOUSE - DAY`, and a writer who opens their file
 * to find it silently reformatted stops trusting the app. Anything that edits
 * an element updates `raw`; everything else survives untouched.
 */

/** Elements that continue the one above with no blank line between them. */
function attachesToPrevious(previous: Element | undefined, current: Element): boolean {
  if (!previous) return false;

  // A cue, its parenthetical and its dialogue are one visual unit — a blank
  // line anywhere inside would break the block apart on the next parse.
  const inDialogue =
    previous.type === 'character' ||
    previous.type === 'parenthetical' ||
    previous.type === 'dialogue';

  const continues =
    current.type === 'dialogue' || current.type === 'parenthetical';

  if (inDialogue && continues) return true;

  // Metadata notes sit directly under their heading.
  if (previous.type === 'sceneHeading' && current.type === 'note') return true;
  if (previous.type === 'note' && current.type === 'note') return true;

  return false;
}

export function serializeTitlePage(titlePage: TitlePage): string {
  const lines: string[] = [];

  for (const field of titlePage.fields) {
    if (field.values.length === 0) {
      lines.push(`${field.rawKey}:`);
    } else if (field.values.length === 1) {
      lines.push(`${field.rawKey}: ${field.values[0]}`);
    } else {
      // Multi-line values are indented under a bare key, which is the form
      // the spec shows and the one every other app writes.
      lines.push(`${field.rawKey}:`);
      for (const value of field.values) lines.push(`\t${value}`);
    }
  }

  return lines.join('\n');
}

export interface SerializeOptions {
  /** Omit the title page. Used for character sides and partial exports. */
  includeTitlePage?: boolean;
  /** Omit boneyard blocks. Used when exporting a shooting draft. */
  includeBoneyard?: boolean;
}

export function serialize(script: Script, options: SerializeOptions = {}): string {
  const { includeTitlePage = true, includeBoneyard = true } = options;

  const parts: string[] = [];

  if (includeTitlePage && script.titlePage) {
    parts.push(serializeTitlePage(script.titlePage));
    parts.push('');
  }

  let previous: Element | undefined;

  for (const element of script.elements) {
    if (!includeBoneyard && element.type === 'boneyard') continue;

    if (previous && !attachesToPrevious(previous, element)) parts.push('');
    parts.push(element.raw);
    previous = element;
  }

  const text = parts.join('\n');
  // A screenplay file ends with a newline. Editors and diffs both expect it.
  return text.endsWith('\n') ? text : `${text}\n`;
}

/**
 * Serializes only the scenes a character appears in — their "sides".
 *
 * Everything between the chosen scene headings is kept, including other
 * characters' lines, because an actor needs their cues.
 */
export function serializeSides(script: Script, character: string): string {
  const wanted = new Set(
    script.scenes
      .map((scene, index) => (scene.speaking.includes(character.toUpperCase()) ? index : -1))
      .filter((index) => index >= 0),
  );

  if (wanted.size === 0) return '';

  const keep: Element[] = [];
  for (const index of wanted) {
    const scene = script.scenes[index];
    if (!scene) continue;
    for (const element of script.elements) {
      if (element.from >= scene.from && element.to <= scene.to) keep.push(element);
    }
  }

  keep.sort((a, b) => a.from - b.from);

  return serialize({ ...script, elements: keep }, { includeTitlePage: false });
}
