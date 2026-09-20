import { parse } from './parse';

/**
 * Moving scenes around in the text itself.
 *
 * The index card board is a view over the document, not a second copy of it,
 * so dragging a card has to come out the other end as plain Fountain the
 * writer would have typed. Three things make that harder than splicing an
 * array:
 *
 * 1. **A scene is not everything up to the next heading.** An act break —
 *    `# Akt II` — sits between two scenes and belongs to the document's
 *    structure, not to the scene above it. Dragging scene 4 must not drag the
 *    act heading along with it.
 * 2. **Blank lines are the writer's.** Fountain treats every carriage return
 *    as intentional, so the spacing stays where it was in the document rather
 *    than travelling with the scene. A scene that moves lands in the rhythm of
 *    its new home.
 * 3. **The preamble is not a scene.** A title page, or a line of action before
 *    the first heading, has no card and never moves.
 */

/** One stretch of the document, in order. Only `scene` pieces are movable. */
interface Piece {
  kind: 'fixed' | 'scene';
  /** The text, with any trailing blank lines stripped off into `tail`. */
  body: string;
  /** The newlines that followed it. They belong to the position, not the text. */
  tail: string;
}

const TRAILING_NEWLINES = /\n+$/;

function split(text: string): { body: string; tail: string } {
  const match = TRAILING_NEWLINES.exec(text);
  return match ? { body: text.slice(0, match.index), tail: match[0] } : { body: text, tail: '' };
}

/**
 * The document as a list of pieces, with every scene its own movable one.
 *
 * Exported for the board, which needs to know that the number of scene pieces
 * matches the number of cards it is drawing.
 */
export function scenePieces(source: string): Piece[] {
  const script = parse(source);
  if (script.scenes.length === 0) return [{ kind: 'fixed', ...split(source) }];

  // Offsets that end a scene: the next scene, or a section heading, which
  // stays where it is.
  const stops = [
    ...script.scenes.map((scene) => scene.from),
    ...script.sections.map((section) => section.from),
  ].sort((a, b) => a - b);

  const nextStop = (after: number) => stops.find((offset) => offset > after) ?? source.length;

  const pieces: Piece[] = [];
  let cursor = 0;

  for (const scene of script.scenes) {
    // Anything between where we are and this heading is fixed: the preamble,
    // an act heading, a stray note.
    if (scene.from > cursor) pieces.push({ kind: 'fixed', ...split(source.slice(cursor, scene.from)) });
    const end = nextStop(scene.from);
    pieces.push({ kind: 'scene', ...split(source.slice(scene.from, end)) });
    cursor = end;
  }

  if (cursor < source.length) pieces.push({ kind: 'fixed', ...split(source.slice(cursor)) });

  return pieces;
}

/**
 * Moves scene `from` to position `to`, counting scenes only.
 *
 * Returns the source unchanged when there is nothing to do — the same index,
 * an index that is not a scene, or a document with no scenes — so the caller
 * can hand the result straight to the editor and let an unchanged string be a
 * no-op edit.
 */
export function reorderScenes(source: string, from: number, to: number): string {
  const pieces = scenePieces(source);
  const scenes = pieces.filter((piece) => piece.kind === 'scene');

  if (from === to) return source;
  if (from < 0 || to < 0 || from >= scenes.length || to >= scenes.length) return source;

  const bodies = scenes.map((piece) => piece.body);
  const [moved] = bodies.splice(from, 1);
  bodies.splice(to, 0, moved as string);

  // The bodies move; the spacing does not. Each slot keeps the blank lines it
  // already had, so the document's rhythm survives the drag.
  let next = 0;
  return pieces
    .map((piece) => {
      const body = piece.kind === 'scene' ? (bodies[next++] as string) : piece.body;
      return `${body}${piece.tail}`;
    })
    .join('');
}
