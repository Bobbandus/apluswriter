import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  BRIDGE_DEFAULT_PORT,
  BRIDGE_PORT_RANGE,
  BRIDGE_VERSION,
  type AppMessage,
  type AppState,
  type BridgeFile,
  type SceneRef,
  type ServerMessage,
  type Suggestion,
  type SuggestionCard,
} from '../../packages/bridge/protocol';

/**
 * The live bridge between this MCP server and the open A+ Write app.
 *
 * Who may connect, and why each check exists:
 *
 * - **127.0.0.1 only.** Nothing on the network can reach it.
 * - **Browser origins are checked.** Any web page the writer visits could try
 *   `new WebSocket('ws://127.0.0.1:47831')`. Browsers always send an Origin
 *   header, so pages that are not A+ Write are turned away at the handshake.
 * - **A token.** Written to `~/.aplus-write/bridge.json`, which the desktop
 *   app and the local dev server can read and a web page cannot. Belt and
 *   braces for the origin check.
 *
 * Everything the app sends is kept as the latest `AppState`; everything
 * Claude proposes goes back as a `SuggestionCard`.
 */

// APLUS_BRIDGE_DIR lets tests (and unusual setups) keep the pairing file elsewhere.
const BRIDGE_DIR = process.env['APLUS_BRIDGE_DIR'] ?? join(homedir(), '.aplus-write');
const BRIDGE_FILE = join(BRIDGE_DIR, 'bridge.json');

/** Browser origins allowed to connect. Non-browser clients send none. */
function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (/^app:\/\//i.test(origin)) return true; // the Electron build
  const extra = (process.env['APLUS_BRIDGE_ORIGINS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else — still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readFile(): BridgeFile {
  try {
    const parsed = JSON.parse(readFileSync(BRIDGE_FILE, 'utf8')) as BridgeFile;
    return { servers: (parsed.servers ?? []).filter((s) => isAlive(s.pid)) };
  } catch {
    return { servers: [] };
  }
}

function writeFile(file: BridgeFile): void {
  mkdirSync(BRIDGE_DIR, { recursive: true });
  writeFileSync(BRIDGE_FILE, JSON.stringify(file, null, 2), { mode: 0o600 });
}

export class Bridge {
  private wss: WebSocketServer | null = null;
  private readonly sockets = new Set<WebSocket>();
  private readonly trusted = new WeakSet<WebSocket>();
  private state: AppState | null = null;
  private stateAt = 0;
  private readonly decisions = new Map<string, boolean>();
  readonly token = randomBytes(24).toString('base64url');
  port = 0;

  /** Starts listening on the first free port in the range. Never throws. */
  async start(): Promise<boolean> {
    for (let offset = 0; offset < BRIDGE_PORT_RANGE; offset += 1) {
      const port = BRIDGE_DEFAULT_PORT + offset;
      const ok = await new Promise<boolean>((resolve) => {
        const server = new WebSocketServer({
          host: '127.0.0.1',
          port,
          maxPayload: 8 * 1024 * 1024,
          verifyClient: (info: { origin?: string }) => originAllowed(info.origin),
        });
        server.once('listening', () => {
          this.wss = server;
          resolve(true);
        });
        server.once('error', () => {
          server.close();
          resolve(false);
        });
      });
      if (ok) {
        this.port = port;
        this.listen();
        this.announce();
        return true;
      }
    }
    return false;
  }

  private listen(): void {
    this.wss?.on('connection', (socket) => {
      this.sockets.add(socket);

      // An untrusted socket gets a few seconds to say hello with the token.
      const timer = setTimeout(() => {
        if (!this.trusted.has(socket)) socket.close(4001, 'hello expected');
      }, 5_000);

      socket.on('message', (raw) => {
        let message: AppMessage;
        try {
          message = JSON.parse(raw.toString()) as AppMessage;
        } catch {
          return;
        }

        if (!this.trusted.has(socket)) {
          if (message.type === 'hello' && message.token === this.token) {
            this.trusted.add(socket);
            clearTimeout(timer);
            this.send(socket, { type: 'welcome', version: BRIDGE_VERSION, server: 'aplus-write-mcp' });
          } else {
            socket.close(4003, 'bad token');
          }
          return;
        }

        if (message.type === 'state') {
          this.state = message.state;
          this.stateAt = Date.now();
        } else if (message.type === 'decided') {
          this.decisions.set(message.cardId, message.accepted);
        }
      });

      socket.on('close', () => {
        clearTimeout(timer);
        this.sockets.delete(socket);
        if (![...this.sockets].some((s) => this.trusted.has(s))) this.state = null;
      });
    });
  }

  /** Writes our port and token where the app can find them. */
  private announce(): void {
    const file = readFile();
    file.servers = file.servers.filter((s) => s.pid !== process.pid);
    file.servers.push({ port: this.port, token: this.token, pid: process.pid, startedAt: Date.now() });
    writeFile(file);

    const cleanup = () => this.close();
    process.once('exit', cleanup);
    process.once('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  /** True when an app is connected and has said what is open. */
  get connected(): boolean {
    return [...this.sockets].some((s) => this.trusted.has(s) && s.readyState === s.OPEN);
  }

  /** What is open in the app, or null. */
  get appState(): AppState | null {
    return this.connected ? this.state : null;
  }

  get stateAge(): number {
    return this.stateAt ? Date.now() - this.stateAt : Number.POSITIVE_INFINITY;
  }

  /**
   * Sends a suggestion card to every connected app. Returns false if no app
   * is connected or the writer has cards switched off — the caller then
   * answers in the chat instead.
   */
  suggest(suggestion: Suggestion, label: string): SuggestionCard | null {
    if (!this.connected || this.state?.cards === false) return null;
    const card: SuggestionCard = {
      id: randomBytes(8).toString('hex'),
      suggestion,
      label,
      createdAt: Date.now(),
    };
    for (const socket of this.sockets) {
      if (this.trusted.has(socket)) this.send(socket, { type: 'suggest', card });
    }
    return card;
  }

  /** Asks the app to scroll to a scene. False if no app is connected. */
  focus(scene: SceneRef): boolean {
    if (!this.connected) return false;
    const message: ServerMessage = { type: 'request', id: randomBytes(6).toString('hex'), action: 'focusScene', scene };
    for (const socket of this.sockets) if (this.trusted.has(socket)) this.send(socket, message);
    return true;
  }

  /** Whether the writer accepted a card, if they have decided. */
  decision(cardId: string): boolean | undefined {
    return this.decisions.get(cardId);
  }

  close(): void {
    try {
      const file = readFile();
      file.servers = file.servers.filter((s) => s.pid !== process.pid);
      writeFile(file);
    } catch {
      // Best effort on the way out.
    }
    for (const socket of this.sockets) socket.close();
    this.wss?.close();
    this.wss = null;
  }
}
