'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BRIDGE_VERSION,
  type AppMessage,
  type AppState,
  type SceneRef,
  type ServerMessage,
  type SuggestionCard,
} from '@aplus/bridge/protocol';

/**
 * The app's side of the Claude bridge.
 *
 * Finds a running MCP server (the desktop app is handed its port and token by
 * its shell; the web app on localhost asks the dev server), connects, and
 * keeps the server told what is open. Suggestion cards arrive here.
 *
 * Silent when there is nothing to connect to: most of the time Claude Desktop
 * is not running, and that must never look like an error.
 */

/**
 * Versioned: a card written by an older build can have a shape this one does
 * not understand, and a suggestion panel that throws is worse than one that
 * starts empty. Bump this whenever `Suggestion` changes shape.
 */
const CARDS_KEY = 'aplus.suggestionCards.v2';

export type BridgeStatus = 'off' | 'connecting' | 'connected';

interface Pairing {
  port: number;
  token: string;
}

interface DesktopBridge {
  bridgeInfo?: () => Promise<Pairing | null>;
}

async function findPairing(): Promise<Pairing | null> {
  const desktop = (window as unknown as { aplusDesktop?: DesktopBridge }).aplusDesktop;
  if (desktop?.bridgeInfo) return desktop.bridgeInfo();
  try {
    const response = await fetch('/api/bridge', { cache: 'no-store' });
    return response.ok ? ((await response.json()) as Pairing) : null;
  } catch {
    return null;
  }
}

export interface UseBridge {
  status: BridgeStatus;
  cards: SuggestionCard[];
  /** Removes a card and tells the server what the writer decided. */
  decide: (id: string, accepted: boolean) => void;
  /** Called when Claude asks the app to show a scene. */
  onFocus: (handler: (scene: SceneRef) => void) => void;
}

export function useBridge(state: AppState | null, enabled = true): UseBridge {
  const [status, setStatus] = useState<BridgeStatus>('off');
  const [cards, setCards] = useState<SuggestionCard[]>([]);
  const restored = useRef(false);

  /* Pending cards survive a reload. A suggestion Claude spent a minute on
     should not vanish because the writer refreshed the page. */
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CARDS_KEY) ?? '[]') as SuggestionCard[];
      if (Array.isArray(stored)) setCards(stored);
    } catch {
      // Corrupt or unavailable storage: start empty.
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(CARDS_KEY, JSON.stringify(cards.slice(0, 50)));
    } catch {
      // Storage full or blocked; the cards simply do not persist.
    }
  }, [cards]);
  const socket = useRef<WebSocket | null>(null);
  const latest = useRef<AppState | null>(state);
  const focusHandler = useRef<(scene: SceneRef) => void>(() => undefined);
  latest.current = state;

  const send = useCallback((message: AppMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }

    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      if (stopped) return;
      const pairing = await findPairing();
      if (stopped) return;
      if (!pairing) {
        // Nothing running. Look again in a while; Claude Desktop may start later.
        setStatus('off');
        retry = setTimeout(connect, 8_000);
        return;
      }

      setStatus('connecting');
      const ws = new WebSocket(`ws://127.0.0.1:${pairing.port}`);
      socket.current = ws;

      ws.onopen = () => {
        const hello: AppMessage = {
          type: 'hello',
          token: pairing.token,
          version: BRIDGE_VERSION,
          client: (window as unknown as { aplusDesktop?: unknown }).aplusDesktop ? 'desktop' : 'web',
        };
        ws.send(JSON.stringify(hello));
      };

      ws.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === 'welcome') {
          setStatus('connected');
          if (latest.current) ws.send(JSON.stringify({ type: 'state', state: latest.current } satisfies AppMessage));
        } else if (message.type === 'suggest') {
          setCards((current) => [message.card, ...current.filter((c) => c.id !== message.card.id)]);
        } else if (message.type === 'request' && message.action === 'focusScene') {
          focusHandler.current(message.scene);
        }
      };

      ws.onclose = () => {
        if (socket.current === ws) socket.current = null;
        setStatus('off');
        if (!stopped) retry = setTimeout(connect, 5_000);
      };
      ws.onerror = () => ws.close();
    };

    void connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      socket.current?.close();
      socket.current = null;
    };
  }, [enabled]);

  // Keep the server told what is open — a little after typing pauses, so a
  // 150 KB script is not re-sent on every keystroke.
  useEffect(() => {
    if (status !== 'connected' || !state) return;
    const timer = setTimeout(() => send({ type: 'state', state }), 350);
    return () => clearTimeout(timer);
  }, [state, status, send]);

  const decide = useCallback(
    (id: string, accepted: boolean) => {
      setCards((current) => current.filter((c) => c.id !== id));
      send({ type: 'decided', cardId: id, accepted });
    },
    [send],
  );

  const onFocus = useCallback((handler: (scene: SceneRef) => void) => {
    focusHandler.current = handler;
  }, []);

  return { status, cards, decide, onFocus };
}
