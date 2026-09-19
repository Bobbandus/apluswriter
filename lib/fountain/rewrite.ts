import {
  isCenteredLine,
  isCharacterLine,
  isParentheticalLine,
  isSceneHeadingLine,
  isTransitionLine,
} from './parse';

/**
 * Rewriting one line from one element type into another.
 *
 * This is what ⌘1–⌘8 runs on. The hard part is not adding the new markup — it
 * is that Fountain's element types are mostly *implicit*, decided by case and
 * position rather than by a marker. So switching a line means:
 *
 *   1. strip whatever forcing it already carries,
 *   2. shape the text for the new type (usually case), and
 *   3. add a forcing character only when the shaped text would otherwise be
 *      read as something else.
 *
 * Step 3 is the one that matters. `INT. HOUSE` already reads as a scene
 * heading, so writing `.INT. HOUSE` would be noise in the writer's file. But
 * `SNIPER SCOPE POV` does not, so it needs the period. The app should put as
 * little machinery into the document as it can get away with.
 */

export type SwitchableType =
  | 'sceneHeading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'lyrics'
  | 'section'
  | 'synopsis'
  | 'centered'
  | 'note';

/** The ⌘1–⌘8 order, and the order of the element picker. */
export const SWITCH_ORDER: SwitchableType[] = [
  'sceneHeading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
  'section',
  'synopsis',
];

/** The letter each type answers to in the element picker. */
export const PICKER_KEYS: Record<string, SwitchableType> = {
  s: 'sceneHeading',
  a: 'action',
  c: 'character',
  d: 'dialogue',
  p: 'parenthetical',
  t: 'transition',
  n: 'note',
  l: 'lyrics',
  '#': 'section',
  '=': 'synopsis',
};

/**
 * Removes every forcing character and wrapper from a line.
 *
 * Leading whitespace is dropped with them: indentation is not meaningful in
 * any element except Action, and a line being switched to Action gets its
 * indentation back from the writer, not from leftovers.
 */
export function stripForcing(text: string): string {
  let s = text.trim();

  // Centered `>text<` before transition `>text`, or the trailing `<` survives.
  if (isCenteredLine(s)) return s.slice(1, -1).trim();

  if (isParentheticalLine(s)) return s.slice(1, -1).trim();

  // A section's `#` count is its depth, so strip the whole run.
  if (s.startsWith('#')) return s.replace(/^#+\s*/, '');

  // `===` is a page break, not a synopsis.
  if (/^={3,}\s*$/.test(s)) return '';
  if (s.startsWith('=')) return s.replace(/^=\s*/, '');

  // A forced heading, but never an ellipsis.
  if (s.startsWith('.') && !s.startsWith('..')) return s.slice(1).trim();

  if (s.startsWith('!') || s.startsWith('@') || s.startsWith('>') || s.startsWith('~')) {
    return s.slice(1).trim();
  }

  return s;
}

/** Would this text be read as something other than plain Action? */
function readsAsSomethingElse(text: string): boolean {
  return (
    isSceneHeadingLine(text) ||
    isTransitionLine(text) ||
    isCenteredLine(text) ||
    isCharacterLine(text) ||
    isParentheticalLine(text) ||
    /^[#=~!@>]/.test(text.trim())
  );
}

/**
 * Rewrites `text` so it parses as `to`.
 *
 * Returns the new line, with no trailing newline. The caller replaces the line
 * in the document, which is what keeps the undo history a single coherent edit.
 */
export function rewriteLine(text: string, to: SwitchableType): string {
  const bare = stripForcing(text);

  // An empty line carries only its marker, so the writer can type into it.
  if (bare.length === 0) {
    switch (to) {
      case 'sceneHeading':
        return '.';
      case 'parenthetical':
        return '()';
      case 'lyrics':
        return '~';
      case 'section':
        return '# ';
      case 'synopsis':
        return '= ';
      case 'note':
        return '[[]]';
      case 'transition':
        return '> ';
      case 'centered':
        return '><';
      default:
        return '';
    }
  }

  switch (to) {
    case 'sceneHeading': {
      const upper = bare.toUpperCase();
      // Already a recognised slugline — adding a period would be noise.
      return isSceneHeadingLine(upper) ? upper : `.${upper}`;
    }

    case 'character': {
      const upper = bare.toUpperCase();
      // `@` is only needed when uppercasing would not be enough, which for a
      // cue means the line has no letters to uppercase.
      return isCharacterLine(upper) ? upper : `@${bare}`;
    }

    case 'transition': {
      const upper = bare.toUpperCase();
      return isTransitionLine(upper) ? upper : `> ${bare}`;
    }

    case 'parenthetical':
      return `(${bare})`;

    case 'lyrics':
      return `~${bare}`;

    case 'section':
      return `# ${bare}`;

    case 'synopsis':
      return `= ${bare}`;

    case 'centered':
      return `>${bare}<`;

    case 'note':
      return `[[${bare}]]`;

    case 'dialogue':
      // Dialogue has no markup of its own — it is dialogue because of what
      // sits above it. Stripping the forcing is the whole job.
      return bare;

    case 'action':
      // Only bang it if it would otherwise be misread.
      return readsAsSomethingElse(bare) ? `!${bare}` : bare;

    default:
      return bare;
  }
}

/**
 * Best guess at what a line currently is, judged on its own.
 *
 * This is for the element label in the UI and for `Shift+Tab`. It is not the
 * parser — the parser knows what came before the line, which is how it can
 * tell dialogue from action. Anything positional resolves to Action here.
 */
export function guessType(text: string): SwitchableType {
  const s = text.trim();
  if (s.length === 0) return 'action';
  if (isCenteredLine(s)) return 'centered';
  if (/^#/.test(s)) return 'section';
  if (/^={3,}$/.test(s)) return 'action';
  if (/^=/.test(s)) return 'synopsis';
  if (/^~/.test(s)) return 'lyrics';
  if (/^\[\[.*\]\]$/.test(s)) return 'note';
  if (s.startsWith('!')) return 'action';
  if (isSceneHeadingLine(s)) return 'sceneHeading';
  if (isTransitionLine(s)) return 'transition';
  if (isParentheticalLine(s)) return 'parenthetical';
  if (isCharacterLine(s)) return 'character';
  return 'action';
}
