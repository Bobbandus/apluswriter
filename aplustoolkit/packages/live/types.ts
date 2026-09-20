/**
 * A+ Live: what a board holds.
 *
 * A board is one overlay that OBS shows as a browser source. Its state is a small JSON object kept in the
 * database, and every change is a pure function from the old state to the new one (see score.ts, pingis.ts and
 * lower.ts), so the rules can be tested without a screen and replayed without a server.
 */

export type BoardKind = 'score' | 'pingis' | 'lower';

export const BOARD_KINDS: readonly BoardKind[] = ['score', 'pingis', 'lower'];

export type Side = 'a' | 'b';

export const other = (side: Side): Side => (side === 'a' ? 'b' : 'a');

/** One side of a scoreboard: who it is and how to draw it. */
export interface SideInfo {
  name: string;
  /** A CSS colour (hex or rgb/hsl), or empty to take the theme's. */
  color: string;
  /** An image URL, or empty for none. */
  logo: string;
  /** A two-letter country code for a flag beside the name (SE, DE), or empty for none. */
  flag: string;
}

/* ------------------------------------------------------------------ score */

export interface ScoreState {
  a: SideInfo & { score: number };
  b: SideInfo & { score: number };
  /** A line above or beside the score: "Semifinal", "Omgång 2", "SLUTRESULTAT", "1st Half". */
  label: string;
  /** Text for a clock, set by the operator: "15:00". A running clock comes later. */
  clock: string;
}

/* ------------------------------------------------------------------ pingis */

export interface PingisSide extends SideInfo {
  /** Points in the game being played. */
  points: number;
  /** Games won in the match. */
  sets: number;
}

/** What one undo step needs to put the board back. */
export type PingisSnapshot = Omit<PingisState, 'undo'>;

export interface PingisState {
  a: PingisSide;
  b: PingisSide;
  /** Best of 3, 5 or 7. */
  bestOf: 3 | 5 | 7;
  /** Who served first in the current game. It alternates with each game. */
  firstServer: Side;
  /** Who serves now, worked out from the points and kept here so a page only has to draw it. */
  server: Side;
  /** Set when the game just ended and its score is still on show; cleared by "next game". */
  gameWon: Side | null;
  /** Set when the match is over. */
  winner: Side | null;
  /** The score of each finished game, in order, for the strip of results. */
  games: { a: number; b: number }[];
  label: string;
  /** The last few states, newest last. */
  undo: PingisSnapshot[];
}

/* ------------------------------------------------------------------ lower third */

export interface LowerItem {
  title: string;
  subtitle: string;
}

export interface LowerState {
  items: LowerItem[];
  /** Which item is up, or would be if shown. */
  index: number;
  visible: boolean;
}

export type BoardState = ScoreState | PingisState | LowerState;
