'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAction, normalizeState, type LiveAction } from '@aplus/live/board';
import { DEFAULT_THEMES, validateTheme, type Theme } from '@aplus/live/theme';
import type { BoardKind, BoardState } from '@aplus/live/types';
import { LiveError, type LiveBoardData, type LiveStore, type NudgeChannel } from './types';
import { storeForToken } from './store';

export type LiveStatus = 'loading' | 'ready' | 'missing' | 'notInstalled' | 'notConfigured' | 'offline';

export interface LiveBoard {
  id: string;
  kind: BoardKind;
  name: string;
  state: BoardState;
  theme: Theme;
  version: number;
  canControl: boolean;
}

const POLL_MS = 5000;
const RETRIES = 5;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A board, kept up to date, and (for the operator's link) changed by actions.
 *
 * What is on screen is the last state the server confirmed with the actions still on their way laid over it,
 * so a button press shows at once. Actions are sent one at a time, each computed from the server's latest state
 * and version; when someone else got in first the write is refused, the board is read again and the same
 * action is applied to that, so two operators pressing "+" together lose no points.
 *
 * The page looks again whenever the channel nudges it, and every few seconds regardless, so a nudge that was
 * lost never leaves the board stale for long.
 */
export function useLiveBoard(token: string) {
  const [server, setServer] = useState<LiveBoardData | null>(null);
  const [pending, setPending] = useState<LiveAction[]>([]);
  const [status, setStatus] = useState<LiveStatus>('loading');

  const serverRef = useRef<LiveBoardData | null>(null);
  const pendingRef = useRef<LiveAction[]>([]);
  const storeRef = useRef<LiveStore | null>(null);
  const channelRef = useRef<NudgeChannel | null>(null);
  const draining = useRef(false);

  const accept = useCallback((data: LiveBoardData) => {
    // An older answer never replaces a newer one.
    if (serverRef.current && data.id === serverRef.current.id && data.version < serverRef.current.version) return;
    serverRef.current = data;
    setServer(data);
    setStatus('ready');
  }, []);

  const refresh = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    try {
      const data = await store.get(token, serverRef.current?.version);
      if (data === 'unchanged') return;
      if (data === null) return setStatus('missing');
      accept(data);
    } catch (error) {
      if (error instanceof LiveError && error.code === 'notInstalled') setStatus('notInstalled');
      else setStatus((current) => (current === 'ready' ? current : 'offline'));
    }
  }, [accept, token]);

  useEffect(() => {
    let stopped = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      let store: LiveStore;
      try {
        store = storeForToken(token);
      } catch (error) {
        if (error instanceof LiveError) setStatus(error.code === 'notConfigured' ? 'notConfigured' : 'offline');
        return;
      }
      storeRef.current = store;
      await refresh();
      if (stopped || !serverRef.current) return;
      channelRef.current = store.channel(serverRef.current.id);
      unsubscribe = channelRef.current.onNudge(() => void refresh());
      poll = setInterval(() => void refresh(), POLL_MS);
    })();

    return () => {
      stopped = true;
      if (poll) clearInterval(poll);
      unsubscribe?.();
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [token, refresh]);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    let failures = 0;
    try {
      while (pendingRef.current.length > 0) {
        const store = storeRef.current;
        const base = serverRef.current;
        const head = pendingRef.current[0]!;
        if (!store || !base) break;

        const next = applyAction(base.kind, normalizeState(base.kind, base.state), head);
        let result;
        try {
          result = await store.update(token, next, base.version);
        } catch {
          result = { ok: false as const, reason: 'error' as const };
        }

        if (result.ok) {
          failures = 0;
          accept({ ...base, state: next, version: result.version });
          channelRef.current?.nudge(result.version);
          pendingRef.current = pendingRef.current.slice(1);
          setPending(pendingRef.current);
        } else if (result.reason === 'conflict') {
          // Someone else changed the board first: read it as it is now and apply the same action to that.
          if (++failures > RETRIES) break;
          const latest = await store.get(token).catch(() => null);
          if (latest && latest !== 'unchanged') {
            accept(latest);
          }
        } else if (result.reason === 'missing') {
          setStatus('missing');
          break;
        } else {
          setStatus('offline');
          if (++failures > RETRIES) break;
          await wait(1200);
        }
      }
    } finally {
      // Whatever could not be sent is dropped, so the screen shows the truth again instead of a wish.
      pendingRef.current = [];
      setPending([]);
      draining.current = false;
    }
  }, [accept, token]);

  const apply = useCallback(
    (action: LiveAction) => {
      if (!serverRef.current?.canControl) return;
      pendingRef.current = [...pendingRef.current, action];
      setPending(pendingRef.current);
      void drain();
    },
    [drain],
  );

  const board = useMemo<LiveBoard | null>(() => {
    if (!server) return null;
    const confirmed = normalizeState(server.kind, server.state);
    const state = pending.reduce((current, action) => applyAction(server.kind, current, action), confirmed);
    const parsed = validateTheme(server.theme);
    return { id: server.id, kind: server.kind, name: server.name, state, theme: parsed.ok ? parsed.theme : DEFAULT_THEMES[0]!, version: server.version, canControl: server.canControl };
  }, [server, pending]);

  return { board, status, apply, refresh };
}
