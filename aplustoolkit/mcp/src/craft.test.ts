import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { registerAssistant } from './assistant';
import type { Bridge } from './bridge';
import { CRAFT, RULES, WRITING_RULES, WRITING_TOOLS } from './craft';
import type { Library } from './library';

/**
 * The craft rules are only worth anything if they are actually attached to the
 * tools that can change the writer's words. Registration is cheap and pure —
 * no handler runs — so the descriptions can simply be read back and checked.
 */
function registeredTools(): Map<string, string> {
  const tools = new Map<string, string>();

  const server = {
    registerTool(name: string, config: { description?: string }) {
      tools.set(name, config.description ?? '');
    },
    registerPrompt() {
      // Prompts carry RULES, which is checked directly below.
    },
  };

  registerAssistant({
    server: server as unknown as McpServer,
    bridge: { appState: null, connected: false } as unknown as Bridge,
    library: {} as Library,
    findScene: () => {
      throw new Error('findScene is not called while registering');
    },
  });

  return tools;
}

describe('the craft rules reach the tools that can change words', () => {
  const tools = registeredTools();

  it.each(WRITING_TOOLS)('%s exists and carries the reminder', (name) => {
    const description = tools.get(name);
    expect(description, `${name} is not registered`).toBeDefined();
    expect(description).toContain('Craft rules');
  });

  it('tells the model what a rewrite costs it: an exact excerpt, and the writer\'s click', () => {
    const description = tools.get('suggest_rewrite') ?? '';
    expect(description).toContain('EXACT');
    expect(description).toContain('"Use"');
    expect(description).toMatch(/never call this speculatively/i);
  });

  // A list of English clichés is no use against a script written in Swedish.
  it('names its banned moves in both languages', () => {
    expect(CRAFT).toContain('Han vet mer än han ska');
    expect(CRAFT).toContain('He knows more than he should');
    expect(CRAFT).toContain('Tystnad.');
  });
});

describe('the rules the commands repeat', () => {
  // The server used to say "NEVER write, rewrite or improve" while shipping a
  // rewrite tool, and the contradiction won: it refused to rewrite when asked.
  it('points at the rewrite tool instead of forbidding rewrites outright', () => {
    expect(RULES).toContain('suggest_rewrite');
    // The exact wording that used to win the argument against the tool.
    expect(RULES).not.toMatch(/never write, rewrite/i);

    // Every "never rewrite" has to carry its qualifier in the same sentence.
    // Split off from it — "Never rewrite their dialogue. When asked, …" — the
    // first sentence is the one the model obeys.
    const sentences = RULES.split(/(?<=\.)\s+/);
    const bans = sentences.filter((sentence) => /never rewrite/i.test(sentence));
    expect(bans.length).toBeGreaterThan(0);
    for (const ban of bans) expect(ban).toMatch(/on your own initiative|unless|without being asked/i);
  });

  it('adds the craft rules for the commands that put words on the page', () => {
    expect(WRITING_RULES).toContain(RULES);
    expect(WRITING_RULES).toContain(CRAFT);
  });
});
