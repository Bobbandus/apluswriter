/// <reference lib="webworker" />

import { parse } from './parse';
import type { Script } from './types';

/**
 * The parse worker.
 *
 * Typing never waits on this. Live formatting is drawn by the editor's own
 * line classifier, which is block-local and costs microseconds; the worker
 * exists for the things that genuinely need the whole document — the scene
 * navigator, the character and location tables, the to-do list.
 *
 * A full parse of a 146 KB feature takes around 40ms. On the main thread that
 * would be a dropped frame on every keystroke. Here it is invisible.
 */

/**
 * What crosses the wire.
 *
 * Deliberately *not* the element array. Big Fish parses to roughly 2,500
 * elements, each with its own spans, and structured-cloning all of that on
 * every idle moment would cost far more than the parse did. The UI only ever
 * needs the indexes, so only the indexes are sent.
 */
export interface ScriptSummary {
  titlePage: Script['titlePage'];
  scenes: Script['scenes'];
  characters: Script['characters'];
  locations: Script['locations'];
  todos: Script['todos'];
  elementCount: number;
  /** Milliseconds the parse took, for the performance budget. */
  parseMs: number;
}

export type ParseRequest = { type: 'parse'; id: number; source: string };
export type ParseResponse =
  | { type: 'parsed'; id: number; summary: ScriptSummary }
  | { type: 'error'; id: number; message: string };

export function summarize(source: string): ScriptSummary {
  const started = performance.now();
  const script = parse(source);

  return {
    titlePage: script.titlePage,
    scenes: script.scenes,
    characters: script.characters,
    locations: script.locations,
    todos: script.todos,
    elementCount: script.elements.length,
    parseMs: performance.now() - started,
  };
}

// Guarded so this module can also be imported directly on the main thread as
// a fallback when Workers are unavailable.
if (typeof self !== 'undefined' && typeof (self as unknown as Worker).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<ParseRequest>) => {
    const request = event.data;
    if (request?.type !== 'parse') return;

    try {
      const response: ParseResponse = {
        type: 'parsed',
        id: request.id,
        summary: summarize(request.source),
      };
      self.postMessage(response);
    } catch (error) {
      // A parse failure must never take the editor down with it — the writer
      // keeps typing, the navigator just goes stale until the next edit.
      const response: ParseResponse = {
        type: 'error',
        id: request.id,
        message: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    }
  };
}
