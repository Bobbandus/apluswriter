'use client';

import { useEffect, useRef, useState } from 'react';
import type { LayoutOptions, ParseRequest, ParseResponse, ScriptSummary } from '@aplus/fountain/worker';

const EMPTY: ScriptSummary = {
  titlePage: null,
  scenes: [],
  characters: [],
  locations: [],
  todos: [],
  elementCount: 0,
  parseMs: 0,
  layout: null,
};

/**
 * The parsed view of the document, kept off the typing path.
 *
 * Debounced rather than run per keystroke: the navigator does not need to
 * update mid-word, and re-parsing a feature on every character would be pure
 * waste even in a worker. 140ms is short enough that finishing a slugline and
 * glancing left already shows the new scene.
 *
 * Falls back to parsing on the main thread if Workers are unavailable — that
 * is slower on a long script, but a stale navigator is a worse failure than a
 * slow one.
 */
export function useScript(source: string, layout?: LayoutOptions, debounceMs = 140): ScriptSummary {
  const [summary, setSummary] = useState<ScriptSummary>(EMPTY);
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const latest = useRef(0);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;

    let instance: Worker;
    try {
      instance = new Worker(new URL('../../../packages/fountain/worker.ts', import.meta.url));
    } catch {
      return; // No worker: the effect below parses inline instead.
    }

    instance.onmessage = (event: MessageEvent<ParseResponse>) => {
      const message = event.data;
      // Out-of-order replies are dropped; only the newest parse is the truth.
      if (message.id !== latest.current) return;
      if (message.type === 'parsed') setSummary(message.summary);
    };

    worker.current = instance;

    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      nextId.current += 1;
      latest.current = nextId.current;

      const active = worker.current;
      if (active) {
        const request: ParseRequest = { type: 'parse', id: nextId.current, source, ...(layout ? { layout } : {}) };
        active.postMessage(request);
        return;
      }

      // Main-thread fallback. Imported lazily so the parser is not pulled into
      // the initial bundle when the worker path is available.
      void import('@aplus/fountain/worker').then(({ summarize }) => {
        setSummary(summarize(source, layout));
      });
    }, debounceMs);

    return () => window.clearTimeout(timer);
    // The layout options are compared by value: a new object with the same
    // settings must not trigger a re-parse on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, debounceMs, layout?.pageSize, layout?.moreLabel, layout?.contdLabel]);

  return summary;
}
