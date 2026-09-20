import type { BoardKind } from '@aplus/live/types';
import type { LiveBoardData, LiveStore, NudgeChannel, OwnedBoard, UpdateResult } from './types';

/**
 * Boards kept in this browser's localStorage.
 *
 * For working on the overlays without a server, and for a device that has no Supabase at all. Two tabs of the
 * same browser see each other through the `storage` event, which is enough to try a board end to end. OBS runs
 * its own browser, so a local board is never visible there; the interface says so.
 */

export const LOCAL_PREFIX = 'local-';
const KEY = 'aplus.live.boards';

interface Stored extends OwnedBoard {
  deleted?: boolean;
}

const random = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');

function read(): Stored[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as Stored[]) : [];
  } catch {
    return [];
  }
}

function write(boards: Stored[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(boards));
  } catch {
    // Blocked storage: the board simply does not persist.
  }
}

const live = () => read().filter((board) => !board.deleted);
const toData = (board: Stored, canControl: boolean): LiveBoardData => ({ id: board.id, kind: board.kind, name: board.name, state: board.state, theme: board.theme, version: board.version, canControl });

export const localStore: LiveStore = {
  async get(token, sinceVersion) {
    const board = live().find((b) => b.outputToken === token || b.controlToken === token);
    if (!board) return null;
    if (sinceVersion !== undefined && sinceVersion === board.version) return 'unchanged';
    return toData(board, board.controlToken === token);
  },

  async update(controlToken, state, expectedVersion): Promise<UpdateResult> {
    const boards = read();
    const board = boards.find((b) => !b.deleted && b.controlToken === controlToken);
    if (!board) return { ok: false, reason: 'missing' };
    if (board.version !== expectedVersion) return { ok: false, reason: 'conflict', currentVersion: board.version };
    board.state = state;
    board.version += 1;
    write(boards);
    return { ok: true, version: board.version };
  },

  channel(boardId): NudgeChannel {
    const listeners = new Set<() => void>();
    // The storage event fires in the *other* tabs, which is the ones that need telling.
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY || event.key === `${KEY}.nudge.${boardId}`) listeners.forEach((listener) => listener());
    };
    window.addEventListener('storage', onStorage);
    return {
      onNudge: (callback) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      nudge: (version) => {
        try {
          window.localStorage.setItem(`${KEY}.nudge.${boardId}`, String(version) + ':' + Date.now());
        } catch {
          // Nothing to tell anyone if storage is blocked.
        }
      },
      close: () => window.removeEventListener('storage', onStorage),
    };
  },

  async list() {
    return live();
  },

  async create(kind: BoardKind, name, state) {
    const board: Stored = {
      id: `${LOCAL_PREFIX}${random()}`,
      kind,
      name,
      state,
      theme: {},
      version: 1,
      outputToken: `${LOCAL_PREFIX}${random()}`,
      controlToken: `${LOCAL_PREFIX}${random()}`,
    };
    write([...read(), board]);
    return board;
  },

  async save(id, patch) {
    const boards = read();
    const board = boards.find((b) => b.id === id);
    if (!board) return;
    let changed = false;
    if (patch.name !== undefined && patch.name !== board.name) (board.name = patch.name), (changed = true);
    if (patch.theme !== undefined) (board.theme = patch.theme), (changed = true);
    if (patch.state !== undefined) (board.state = patch.state), (changed = true);
    if (changed) board.version += 1;
    write(boards);
  },

  async rotate(id, which) {
    const boards = read();
    const board = boards.find((b) => b.id === id)!;
    if (which === 'output') board.outputToken = `${LOCAL_PREFIX}${random()}`;
    else board.controlToken = `${LOCAL_PREFIX}${random()}`;
    write(boards);
    return board;
  },

  async remove(id) {
    write(read().map((board) => (board.id === id ? { ...board, deleted: true } : board)));
  },
};
