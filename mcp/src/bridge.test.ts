import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { AppState } from '../../packages/bridge/protocol';

/**
 * The bridge against a real WebSocket, with a fake "app" on the other end.
 * The checks that matter are the refusals: a wrong token, a foreign web page.
 */

const dir = mkdtempSync(join(tmpdir(), 'aplus-bridge-'));
process.env['APLUS_BRIDGE_DIR'] = dir;

const STATE: AppState = {
  projectId: 'p', title: 'Test', source: 'INT. KÖK - DAG\n\nVilde står.', caret: 3,
  selection: { from: 0, to: 0, text: '' }, pageSize: 'a4', locale: 'sv', cards: true,
};

let bridge: import('./bridge').Bridge;
let paired: { port: number; token: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function connect(origin?: string): Promise<{ ws: WebSocket; messages: unknown[]; closed: Promise<number> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${paired.port}`, origin ? { origin } : {});
    const messages: unknown[] = [];
    const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
    ws.on('message', (m) => messages.push(JSON.parse(m.toString())));
    ws.on('open', () => resolve({ ws, messages, closed }));
    ws.on('error', reject);
  });
}

beforeAll(async () => {
  const { Bridge } = await import('./bridge');
  bridge = new Bridge();
  expect(await bridge.start()).toBe(true);
  const file = JSON.parse(readFileSync(join(dir, 'bridge.json'), 'utf8')) as { servers: { port: number; token: string }[] };
  paired = file.servers[0]!;
});

afterAll(() => bridge.close());

describe('who may connect', () => {
  it('announces its port and token in the pairing file', () => {
    expect(paired.port).toBeGreaterThanOrEqual(47831);
    expect(paired.token).toBe(bridge.token);
  });

  it('welcomes an app with the right token', async () => {
    const { ws, messages } = await connect();
    ws.send(JSON.stringify({ type: 'hello', token: bridge.token, version: 1, client: 'web' }));
    await wait(100);
    expect(messages[0]).toMatchObject({ type: 'welcome' });
    ws.close();
  });

  it('closes on a wrong token', async () => {
    const { ws, closed } = await connect();
    ws.send(JSON.stringify({ type: 'hello', token: 'nope', version: 1, client: 'web' }));
    expect(await closed).toBe(4003);
  });

  it('does not act on state from an app that has not said hello', async () => {
    const { ws, closed } = await connect();
    ws.send(JSON.stringify({ type: 'state', state: STATE }));
    expect(await closed).toBe(4003);
    expect(bridge.appState).toBeNull();
  });

  // Any web page can open a WebSocket to localhost. The browser tells the
  // server which page it is; a page that is not A+ Write is turned away.
  it('refuses a browser page from another site', async () => {
    await expect(connect('https://evil.example')).rejects.toThrow();
  });

  it('accepts the local dev origin', async () => {
    const { ws } = await connect('http://localhost:3000');
    ws.close();
  });
});

describe('talking to an app', () => {
  it('knows what is open, and delivers a card to it', async () => {
    const { ws, messages } = await connect();
    ws.send(JSON.stringify({ type: 'hello', token: bridge.token, version: 1, client: 'web' }));
    await wait(50);
    ws.send(JSON.stringify({ type: 'state', state: STATE }));
    await wait(50);

    expect(bridge.appState?.title).toBe('Test');

    const card = bridge.suggest({ kind: 'synopsis', scene: { index: 0, heading: 'INT. KÖK - DAG' }, text: 'Vilde väntar.' }, 'Synopsis');
    expect(card).not.toBeNull();
    await wait(50);
    expect(messages.find((m) => (m as { type: string }).type === 'suggest')).toMatchObject({ card: { label: 'Synopsis' } });

    ws.send(JSON.stringify({ type: 'decided', cardId: card!.id, accepted: true }));
    await wait(50);
    expect(bridge.decision(card!.id)).toBe(true);
    ws.close();
  });

  it('does not send a card when the writer has cards switched off', async () => {
    const { ws } = await connect();
    ws.send(JSON.stringify({ type: 'hello', token: bridge.token, version: 1, client: 'web' }));
    await wait(50);
    ws.send(JSON.stringify({ type: 'state', state: { ...STATE, cards: false } }));
    await wait(50);
    expect(bridge.suggest({ kind: 'document', title: 't', body: 'b' }, 't')).toBeNull();
    ws.close();
  });

  it('forgets the script when the app disconnects', async () => {
    await wait(150);
    expect(bridge.connected).toBe(false);
    expect(bridge.appState).toBeNull();
    expect(bridge.suggest({ kind: 'document', title: 't', body: 'b' }, 't')).toBeNull();
  });
});
