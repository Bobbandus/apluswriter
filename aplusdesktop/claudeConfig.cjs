'use strict';

/**
 * Wiring A+ Write into Claude Desktop's config, safely.
 *
 * Claude Desktop reads MCP servers from `claude_desktop_config.json`. Editing
 * that file by hand is the step most people get wrong — a stray comma and
 * Claude Desktop silently ignores every server in it. So the desktop app does
 * it: merges one entry into whatever is already there, keeps every other
 * server exactly as it was, and never writes without a backup.
 *
 * Pure functions; the file system and the dialogs live in main.cjs.
 */

const path = require('node:path');

const SERVER_KEY = 'aplus-write';

/** Where Claude Desktop keeps its config on each platform. */
function configPath(platform, env, home) {
  // The path module of the *target* platform, not of whatever runs this code:
  // a Windows path built with posix rules (or the reverse) would be wrong.
  const p = platform === 'win32' ? path.win32 : path.posix;
  if (platform === 'win32') {
    return p.join(env.APPDATA || p.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  if (platform === 'darwin') {
    return p.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  return p.join(env.XDG_CONFIG_HOME || p.join(home, '.config'), 'Claude', 'claude_desktop_config.json');
}

/**
 * Parses the config, tolerating an empty file. Returns `{ ok: false }` for
 * anything that is not a JSON object — the caller must then refuse to write,
 * because overwriting a config we could not read would destroy the user's
 * other servers.
 */
function parseConfig(text) {
  if (!text || !text.trim()) return { ok: true, config: {} };
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
    return { ok: true, config: value };
  } catch {
    return { ok: false };
  }
}

/**
 * Adds (or updates) the A+ Write server, leaving everything else untouched.
 *
 * `command` is plain `node`: Claude Desktop starts MCP servers through the
 * system, and Electron's own bundled runtime is not a general-purpose node.
 */
function withServer(config, { serverPath, scriptsDirs }) {
  const servers = config.mcpServers && typeof config.mcpServers === 'object' ? config.mcpServers : {};
  return {
    ...config,
    mcpServers: {
      ...servers,
      [SERVER_KEY]: { command: 'node', args: [serverPath, ...scriptsDirs] },
    },
  };
}

/** True if the entry is already exactly what we would write. */
function isInstalled(config, { serverPath, scriptsDirs }) {
  const entry = config && config.mcpServers && config.mcpServers[SERVER_KEY];
  if (!entry || entry.command !== 'node') return false;
  const expected = [serverPath, ...scriptsDirs];
  return Array.isArray(entry.args) && entry.args.length === expected.length && entry.args.every((a, i) => a === expected[i]);
}

function serialize(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

module.exports = { SERVER_KEY, configPath, parseConfig, withServer, isInstalled, serialize };
