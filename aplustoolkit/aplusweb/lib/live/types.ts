import type { BoardKind } from '@aplus/live/types';

/** A board as a page sees it, by way of one of its two links. */
export interface LiveBoardData {
  id: string;
  kind: BoardKind;
  name: string;
  /** Raw, as stored. Read it through `normalizeState`. */
  state: unknown;
  /** Raw, as stored. Read it through `validateTheme`. */
  theme: unknown;
  version: number;
  /** True for the operator's link, false for the one that goes in OBS. */
  canControl: boolean;
}

/** A board as its owner sees it: with both links. */
export interface OwnedBoard {
  id: string;
  kind: BoardKind;
  name: string;
  state: unknown;
  theme: unknown;
  version: number;
  outputToken: string;
  controlToken: string;
}

export type UpdateResult = { ok: true; version: number } | { ok: false; reason: 'conflict'; currentVersion: number } | { ok: false; reason: 'missing' | 'error' };

/** Why a board could not be read. `notInstalled` means the SQL has not been run yet. */
export class LiveError extends Error {
  constructor(readonly code: 'notInstalled' | 'notConfigured' | 'network', message: string) {
    super(message);
  }
}

/** A way to tell every page showing a board to look again. It carries no data. */
export interface NudgeChannel {
  onNudge: (callback: () => void) => () => void;
  nudge: (version: number) => void;
  close: () => void;
}

export interface LiveStore {
  /* What the two anonymous pages use. */
  get: (token: string, sinceVersion?: number) => Promise<LiveBoardData | 'unchanged' | null>;
  update: (controlToken: string, state: unknown, expectedVersion: number) => Promise<UpdateResult>;
  channel: (boardId: string) => NudgeChannel;

  /* What the owner uses. */
  list: () => Promise<OwnedBoard[]>;
  create: (kind: BoardKind, name: string, state: unknown) => Promise<OwnedBoard>;
  save: (id: string, patch: { name?: string; theme?: unknown; state?: unknown }) => Promise<void>;
  rotate: (id: string, which: 'output' | 'control') => Promise<OwnedBoard>;
  remove: (id: string) => Promise<void>;
}
