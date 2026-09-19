import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { configPath, isInstalled, parseConfig, serialize, withServer } = require('./claudeConfig.cjs') as {
  configPath: (platform: string, env: Record<string, string>, home: string) => string;
  isInstalled: (c: unknown, o: { serverPath: string; scriptsDirs: string[] }) => boolean;
  parseConfig: (t: string) => { ok: boolean; config?: Record<string, unknown> };
  serialize: (c: unknown) => string;
  withServer: (c: Record<string, unknown>, o: { serverPath: string; scriptsDirs: string[] }) => Record<string, unknown>;
};

const options = { serverPath: 'C:\\apps\\aplus\\server.mjs', scriptsDirs: ['C:\\Users\\a\\Manus'] };

describe('where Claude Desktop keeps its config', () => {
  it('finds it on each platform', () => {
    expect(configPath('win32', { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'C:\\Users\\a')).toMatch(/Roaming.Claude.claude_desktop_config\.json$/);
    expect(configPath('darwin', {}, '/Users/a')).toBe('/Users/a/Library/Application Support/Claude/claude_desktop_config.json');
    expect(configPath('linux', {}, '/home/a')).toMatch(/\.config.Claude.claude_desktop_config\.json$/);
  });
});

describe('merging the server in', () => {
  it('adds the entry to an empty config', () => {
    const { config } = parseConfig('');
    expect(withServer(config!, options)).toEqual({
      mcpServers: { 'aplus-write': { command: 'node', args: [options.serverPath, ...options.scriptsDirs] } },
    });
  });

  // The whole point: someone with other MCP servers must not lose them.
  it('keeps every other server and every other setting exactly as it was', () => {
    const before = {
      theme: 'dark',
      mcpServers: { github: { command: 'npx', args: ['-y', 'x'] }, notes: { command: 'node', args: ['n.js'] } },
    };
    const after = withServer(before, options) as { theme: string; mcpServers: Record<string, unknown> };
    expect(after.theme).toBe('dark');
    expect(after.mcpServers['github']).toEqual(before.mcpServers.github);
    expect(after.mcpServers['notes']).toEqual(before.mcpServers.notes);
    expect(Object.keys(after.mcpServers)).toHaveLength(3);
  });

  it('updates an old A+ Write entry instead of adding a second', () => {
    const old = { mcpServers: { 'aplus-write': { command: 'node', args: ['old.mjs'] } } };
    const after = withServer(old, options) as { mcpServers: Record<string, { args: string[] }> };
    expect(Object.keys(after.mcpServers)).toEqual(['aplus-write']);
    expect(after.mcpServers['aplus-write']?.args[0]).toBe(options.serverPath);
  });

  it('does not change the input', () => {
    const before = { mcpServers: {} };
    withServer(before, options);
    expect(before).toEqual({ mcpServers: {} });
  });
});

describe('refusing to overwrite what it cannot read', () => {
  it('treats a broken or non-object file as unreadable, so nothing gets written over it', () => {
    expect(parseConfig('{ "mcpServers": ').ok).toBe(false);
    expect(parseConfig('[1,2]').ok).toBe(false);
    expect(parseConfig('"text"').ok).toBe(false);
    expect(parseConfig('null').ok).toBe(false);
  });

  it('accepts a real config and an empty one', () => {
    expect(parseConfig('{"a":1}')).toEqual({ ok: true, config: { a: 1 } });
    expect(parseConfig('   \n')).toEqual({ ok: true, config: {} });
  });
});

describe('detecting an existing install', () => {
  it('is installed only when the entry matches exactly', () => {
    const installed = withServer({}, options);
    expect(isInstalled(installed, options)).toBe(true);
    expect(isInstalled(installed, { ...options, scriptsDirs: ['D:\\Other'] })).toBe(false);
    expect(isInstalled({}, options)).toBe(false);
  });
});

it('writes JSON that round-trips and ends with a newline', () => {
  const text = serialize(withServer({}, options));
  expect(text.endsWith('\n')).toBe(true);
  expect(parseConfig(text).ok).toBe(true);
});
