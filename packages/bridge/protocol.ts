/**
 * The bridge protocol: how the MCP server and the open app talk.
 *
 * Claude Desktop starts the MCP server. The server listens on a local
 * WebSocket (127.0.0.1 only). The app — the desktop build, or the web app on
 * localhost — connects to it and keeps it told what is open. Claude can then
 * see the script the writer is looking at and send *suggestions* back, which
 * appear as cards the writer accepts or discards.
 *
 * Two rules are built into the shapes below, not just into the docs:
 *
 * - Suggestions are **structured data** the app renders with its own UI.
 *   There is no "insert this prose" message.
 * - Nothing here can rewrite action or dialogue. The one suggestion that
 *   edits text, `format`, is checked on both ends to change only formatting —
 *   see `onlyFormattingChanged`.
 */

export const BRIDGE_VERSION = 1;
export const BRIDGE_DEFAULT_PORT = 47831;
export const BRIDGE_PORT_RANGE = 10;

/* ========================================================================== */
/* Where a suggestion points                                                  */
/* ========================================================================== */

/**
 * A scene, identified robustly.
 *
 * By position *and* heading, because either alone breaks: positions shift
 * when a scene is added above, and two scenes can share a heading. The app
 * looks for the heading nearest the position.
 */
export interface SceneRef {
  index: number;
  heading: string;
}

/* ========================================================================== */
/* Suggestions                                                                */
/* ========================================================================== */

export type ShotSize = 'EWS' | 'WS' | 'MWS' | 'MS' | 'MCU' | 'CU' | 'ECU' | 'INSERT' | 'OTS' | 'POV' | 'TWO';

export interface Shot {
  /** "1", "2A" … */
  number: string;
  size: ShotSize | string;
  /** Eye level, low, high, Dutch, overhead … */
  angle?: string;
  /** Static, pan, tilt, dolly in, handheld, crane … */
  movement?: string;
  /** Focal length in mm, e.g. 35. */
  lens?: number;
  /** What the shot is of and why. */
  description: string;
  /** Who is in frame. */
  subjects?: string[];
  notes?: string;
}

export interface Shotlist {
  scene: SceneRef;
  shots: Shot[];
  /** How the scene is covered, in one or two sentences. */
  approach?: string;
}

export type Suggestion =
  | { kind: 'shotlist'; shotlist: Shotlist }
  | { kind: 'tags'; scene: SceneRef; tags: { kind: string; value: string }[] }
  | { kind: 'synopsis'; scene: SceneRef; text: string }
  | {
      kind: 'metadata';
      scene: SceneRef;
      color?: string;
      status?: 'draft' | 'revised' | 'locked';
      beat?: string;
      cast?: string[];
    }
  | { kind: 'note'; scene: SceneRef | null; text: string; todo?: boolean }
  | {
      kind: 'format';
      /** What is wrong, in the writer's terms. */
      title: string;
      explanation: string;
      /** The exact text to replace, and what replaces it. */
      before: string;
      after: string;
      /** Where `before` starts, as a hint; the app searches nearby if it moved. */
      near: number;
    }
  | { kind: 'character'; name: string; profile: CharacterProfile }
  | { kind: 'document'; title: string; body: string };

export interface CharacterProfile {
  age?: string;
  summary?: string;
  traits?: string[];
  wants?: string;
  needs?: string;
  arc?: string;
  relationships?: { name: string; relation: string }[];
  /** What the script itself says, so the profile can be checked. */
  evidence?: string[];
}

export interface SuggestionCard {
  id: string;
  suggestion: Suggestion;
  /** Epoch ms. */
  createdAt: number;
  /** Short, for the card header: "Shotlist for scene 4". */
  label: string;
}

/* ========================================================================== */
/* Messages                                                                   */
/* ========================================================================== */

/** What the app tells the server about what is open. */
export interface AppState {
  projectId: string | null;
  title: string;
  /** The whole Fountain source. Local socket, so size is not a concern. */
  source: string;
  caret: number;
  selection: { from: number; to: number; text: string };
  pageSize: 'a4' | 'letter';
  locale: 'sv' | 'en';
  /** The writer has suggestion cards switched on. */
  cards: boolean;
}

export type AppMessage =
  | { type: 'hello'; token: string; version: number; client: 'web' | 'desktop' }
  | { type: 'state'; state: AppState }
  | { type: 'result'; id: string; ok: boolean; data?: unknown; error?: string }
  | { type: 'decided'; cardId: string; accepted: boolean };

export type ServerMessage =
  | { type: 'welcome'; version: number; server: string }
  | { type: 'suggest'; card: SuggestionCard }
  | { type: 'request'; id: string; action: 'focusScene'; scene: SceneRef };

/* ========================================================================== */
/* The one guarantee about text                                               */
/* ========================================================================== */

/**
 * The words, with formatting stripped away: no whitespace, no Fountain
 * markup, no case.
 */
export function wordsOf(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/\[\[[\s\S]*?\]\]/g, '') // notes are not the writer's prose
    .replace(/[\s*_!@.>~^#=()<\\-]/g, '');
}

/**
 * True when `after` differs from `before` only in formatting.
 *
 * This is what makes it safe to let an assistant propose edits at all: a
 * `format` suggestion that would change even one word is refused by the MCP
 * server *and* by the app before it is ever shown. Moving a parenthetical,
 * fixing a blank line, uppercasing a cue, adding a forcing character — fine.
 * Rewording a line — impossible through this channel.
 */
export function onlyFormattingChanged(before: string, after: string): boolean {
  // Same words in the same order: spacing, case, markup, line breaks.
  if (wordsOf(before) === wordsOf(after)) return true;

  // Or the same lines, moved: a parenthetical written under the line it
  // directs, put back above it. Each line keeps its words exactly; only the
  // order of whole lines changes, and the writer still sees it as a diff.
  const lines = (text: string) =>
    text
      .split('\n')
      .map(wordsOf)
      .filter(Boolean)
      .sort();
  const a = lines(before);
  const b = lines(after);
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

/* ========================================================================== */
/* Pairing file                                                               */
/* ========================================================================== */

/**
 * `~/.aplus-write/bridge.json` — where a running MCP server announces its
 * port and token. The desktop app, and the web app's dev server, read it; a
 * random website cannot, which is what the token is for.
 */
export interface BridgeFile {
  servers: { port: number; token: string; pid: number; startedAt: number }[];
}
