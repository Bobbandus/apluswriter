import type { SupabaseClient } from '@supabase/supabase-js';
import type { BoardKind } from '@aplus/live/types';
import { LiveError, type LiveBoardData, type LiveStore, type NudgeChannel, type OwnedBoard, type UpdateResult } from './types';

/**
 * Boards in Supabase, through the two functions in `supabase/05_live.sql` for the anonymous pages and through the
 * table itself for the owner. Row level security is what keeps the table the owner's; the functions are what
 * lets a link reach exactly one board.
 */

interface Row {
  id: string;
  kind: BoardKind;
  name: string;
  state: unknown;
  theme: unknown;
  version: number;
  output_token: string;
  control_token: string;
}

const owned = (row: Row): OwnedBoard => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  state: row.state,
  theme: row.theme,
  version: row.version,
  outputToken: row.output_token,
  controlToken: row.control_token,
});

const COLUMNS = 'id, kind, name, state, theme, version, output_token, control_token';
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** PostgREST answers "no such function" with PGRST202 (or 404) until 05_live.sql has been run. */
function fail(error: { code?: string; message?: string } | null): never {
  if (error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function/i.test(error?.message ?? '')) {
    throw new LiveError('notInstalled', 'The live board functions are missing. Run supabase/05_live.sql in the SQL Editor.');
  }
  throw new LiveError('network', error?.message ?? 'The board could not be reached.');
}

export function supabaseStore(client: SupabaseClient): LiveStore {
  return {
    async get(token, sinceVersion) {
      const { data, error } = await client.rpc('get_live_board', { p_token: token, ...(sinceVersion !== undefined ? { p_since_version: sinceVersion } : {}) });
      if (error) fail(error);
      const row = (data as Array<{ id: string; kind: BoardKind; name: string; state: unknown; theme: unknown; version: number; can_control: boolean }> | null)?.[0];
      if (!row) return sinceVersion !== undefined ? 'unchanged' : null;
      return { id: row.id, kind: row.kind, name: row.name, state: row.state, theme: row.theme, version: row.version, canControl: row.can_control } satisfies LiveBoardData;
    },

    async update(controlToken, state, expectedVersion): Promise<UpdateResult> {
      const { data, error } = await client.rpc('update_live_state', { p_control_token: controlToken, p_state: state, p_expected_version: expectedVersion });
      if (!error) return { ok: true, version: data as number };
      if (error.code === 'P0409') return { ok: false, reason: 'conflict', currentVersion: Number(error.details) || expectedVersion };
      if (error.code === '42501') return { ok: false, reason: 'missing' };
      if (error.code === 'PGRST202') fail(error);
      return { ok: false, reason: 'error' };
    },

    channel(boardId): NudgeChannel {
      const channel = client.channel(`live:${boardId}`, { config: { broadcast: { self: false } } });
      const listeners = new Set<() => void>();
      channel.on('broadcast', { event: 'nudge' }, () => listeners.forEach((listener) => listener())).subscribe();
      return {
        onNudge: (callback) => {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
        nudge: (version) => void channel.send({ type: 'broadcast', event: 'nudge', payload: { version } }),
        close: () => void client.removeChannel(channel),
      };
    },

    async list() {
      const { data, error } = await client.from('live_boards').select(COLUMNS).is('deleted_at', null).order('created_at', { ascending: false });
      if (error) fail(error);
      return ((data ?? []) as Row[]).map(owned);
    },

    async create(kind, name, state) {
      const { data: auth } = await client.auth.getUser();
      const { data, error } = await client.from('live_boards').insert({ owner_id: auth.user?.id, kind, name, state }).select(COLUMNS).single();
      if (error) fail(error);
      return owned(data as Row);
    },

    async save(id, patch) {
      const { error } = await client.from('live_boards').update(patch).eq('id', id);
      if (error) fail(error);
    },

    async rotate(id, which) {
      const { data, error } = await client
        .from('live_boards')
        .update(which === 'output' ? { output_token: newToken() } : { control_token: newToken() })
        .eq('id', id)
        .select(COLUMNS)
        .single();
      if (error) fail(error);
      return owned(data as Row);
    },

    async remove(id) {
      const { error } = await client.from('live_boards').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) fail(error);
    },
  };
}
