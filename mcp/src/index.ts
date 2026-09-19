#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Library } from './library';
import { serialize, serializeSides } from '../../lib/fountain/serialize';
import { estimateMinutes } from '../../lib/paginator/geometry';
import type { Element, Script, SceneIndexEntry } from '../../lib/fountain/types';

/**
 * A+ Write — MCP server.
 *
 * Lets a Claude Desktop session read and annotate Fountain screenplays using
 * the same parser the app runs, so what Claude sees is exactly what the editor
 * sees: the same scene boundaries, the same character tables, the same
 * Fountain+ metadata.
 *
 * The tool split is deliberate and follows the rules the product brief set for
 * any future AI work:
 *
 *   - **Reading is unrestricted.** Outline, scenes, characters, locations,
 *     stats, search — all of it returns structured data, not prose.
 *   - **Writing is mechanical only.** Synopses, scene metadata, notes and
 *     to-dos. Nothing here can touch a line of action or dialogue. That is not
 *     a limitation to be lifted later; it is the point. A writer's prose is
 *     theirs, and a tool that can quietly rewrite it is a tool you cannot
 *     leave running.
 *
 * Every write is line-scoped and reports what it changed.
 */

const server = new McpServer({
  name: 'aplus-write',
  version: '0.1.0',
});

const roots = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const library = new Library(roots.length > 0 ? roots : [process.cwd()]);

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

/** The elements that fall inside a scene. */
function elementsIn(script: Script, scene: SceneIndexEntry): Element[] {
  return script.elements.filter((e) => e.from >= scene.from && e.to <= scene.to);
}

/**
 * Finds a scene by number, stable id, or a substring of its heading.
 *
 * Three ways in because a conversation refers to scenes all three ways —
 * "scene 4", "the one in the kitchen", or an id copied from earlier output.
 */
function findScene(script: Script, reference: string): { scene: SceneIndexEntry; index: number } {
  const needle = reference.trim().toLowerCase();

  const byId = script.scenes.findIndex((s) => s.id.toLowerCase() === needle);
  if (byId >= 0) return { scene: script.scenes[byId] as SceneIndexEntry, index: byId };

  const byNumber = script.scenes.findIndex((s) => (s.sceneNumber ?? '').toLowerCase() === needle);
  if (byNumber >= 0) return { scene: script.scenes[byNumber] as SceneIndexEntry, index: byNumber };

  const asIndex = Number.parseInt(needle, 10);
  if (!Number.isNaN(asIndex) && asIndex >= 1 && asIndex <= script.scenes.length) {
    return { scene: script.scenes[asIndex - 1] as SceneIndexEntry, index: asIndex - 1 };
  }

  const byHeading = script.scenes.findIndex((s) => s.heading.toLowerCase().includes(needle));
  if (byHeading >= 0) return { scene: script.scenes[byHeading] as SceneIndexEntry, index: byHeading };

  throw new Error(
    `No scene matches "${reference}". The script has ${script.scenes.length} scenes; ` +
      `refer to one by its number, its heading, or its id.`,
  );
}

/** Pages a scene is estimated to run, from its share of the script's lines. */
function scenePages(script: Script, scene: SceneIndexEntry): number {
  const chars = scene.to - scene.from;
  // ~55 lines a page at ~45 characters of average line content.
  return Math.max(0.1, Math.round((chars / 2500) * 10) / 10);
}

/* ========================================================================== */
/* Reading                                                                    */
/* ========================================================================== */

server.registerTool(
  'list_scripts',
  {
    title: 'List screenplays',
    description:
      'Lists the Fountain screenplays available in the configured script directories, newest first.',
    inputSchema: {},
  },
  async () => {
    const scripts = await library.list();
    return json({
      roots: library.rootList,
      count: scripts.length,
      scripts: scripts.map((s) => ({
        path: library.display(s.path),
        name: s.name,
        kb: Math.round(s.bytes / 102.4) / 10,
        modified: s.modified,
      })),
    });
  },
);

server.registerTool(
  'get_outline',
  {
    title: 'Get the outline',
    description:
      'The scene-by-scene outline: heading, location, time of day, synopsis, speaking characters, ' +
      'estimated pages, and any A+ metadata (colour, status, beat, cast, tags). Start here.',
    inputSchema: { path: z.string().describe('Path to the .fountain file') },
  },
  async ({ path }) => {
    const script = await library.parse(path);
    return json({
      title: script.titlePage?.fields.find((f) => f.key === 'title')?.values.join(' ') ?? null,
      scenes: script.scenes.length,
      estimatedMinutes: estimateMinutes(
        Math.round(script.scenes.reduce((sum, s) => sum + scenePages(script, s), 0)),
      ),
      outline: script.scenes.map((scene, index) => ({
        number: scene.sceneNumber ?? String(index + 1),
        id: scene.id,
        heading: scene.heading,
        prefix: scene.prefix,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        synopsis: scene.synopsis,
        speaking: scene.speaking,
        pages: scenePages(script, scene),
        meta: scene.meta,
      })),
    });
  },
);

server.registerTool(
  'get_scene',
  {
    title: 'Read one scene',
    description:
      'The full Fountain text of a single scene, plus its parsed elements and metadata. ' +
      'Refer to the scene by number, heading substring, or id.',
    inputSchema: {
      path: z.string().describe('Path to the .fountain file'),
      scene: z.string().describe('Scene number, heading substring, or id'),
    },
  },
  async ({ path, scene: reference }) => {
    const source = await library.read(path);
    const script = await library.parse(path);
    const { scene, index } = findScene(script, reference);

    return json({
      number: scene.sceneNumber ?? String(index + 1),
      id: scene.id,
      heading: scene.heading,
      synopsis: scene.synopsis,
      speaking: scene.speaking,
      meta: scene.meta,
      pages: scenePages(script, scene),
      source: source.slice(scene.from, scene.to).trimEnd(),
      elements: elementsIn(script, scene).map((e) => ({ type: e.type, text: e.text })),
    });
  },
);

server.registerTool(
  'read_script',
  {
    title: 'Read the whole screenplay',
    description:
      'The complete Fountain source. Prefer get_outline or get_scene — a feature is 150 KB, and ' +
      'reading all of it to answer a question about one scene wastes most of the context.',
    inputSchema: { path: z.string().describe('Path to the .fountain file') },
  },
  async ({ path }) => text(await library.read(path)),
);

server.registerTool(
  'get_characters',
  {
    title: 'Character report',
    description:
      'Every speaking character with cue count, spoken word count (parentheticals excluded), ' +
      'the scenes they appear in, and the extensions they are used with.',
    inputSchema: { path: z.string().describe('Path to the .fountain file') },
  },
  async ({ path }) => {
    const script = await library.parse(path);
    return json({
      characters: script.characters.map((c) => ({
        name: c.name,
        cues: c.cues,
        words: c.words,
        sceneCount: c.scenes.length,
        scenes: c.scenes.map((i) => script.scenes[i]?.heading ?? null),
        extensions: c.extensions,
      })),
    });
  },
);

server.registerTool(
  'get_locations',
  {
    title: 'Location report',
    description:
      'Every location, merged across its interior/exterior prefixes and times of day, with the ' +
      'scenes shot there. Useful for scheduling and for spotting near-duplicate location names.',
    inputSchema: { path: z.string().describe('Path to the .fountain file') },
  },
  async ({ path }) => {
    const script = await library.parse(path);
    return json({
      locations: script.locations.map((l) => ({
        name: l.name,
        prefixes: l.prefixes,
        timesOfDay: l.timesOfDay,
        sceneCount: l.scenes.length,
        scenes: l.scenes.map((i) => script.scenes[i]?.heading ?? null),
      })),
    });
  },
);

server.registerTool(
  'get_stats',
  {
    title: 'Script statistics',
    description:
      'Scene, character and location counts, estimated runtime, and the dialogue-to-action ratio ' +
      'per scene — which is a quick way to find scenes that have gone talky.',
    inputSchema: { path: z.string().describe('Path to the .fountain file') },
  },
  async ({ path }) => {
    const script = await library.parse(path);

    const perScene = script.scenes.map((scene, index) => {
      const elements = elementsIn(script, scene);
      const dialogue = elements
        .filter((e) => e.type === 'dialogue')
        .reduce((n, e) => n + e.text.split(/\s+/).filter(Boolean).length, 0);
      const action = elements
        .filter((e) => e.type === 'action')
        .reduce((n, e) => n + e.text.split(/\s+/).filter(Boolean).length, 0);

      return {
        number: scene.sceneNumber ?? String(index + 1),
        heading: scene.heading,
        dialogueWords: dialogue,
        actionWords: action,
        dialogueRatio: dialogue + action === 0 ? 0 : Math.round((dialogue / (dialogue + action)) * 100) / 100,
        pages: scenePages(script, scene),
      };
    });

    return json({
      scenes: script.scenes.length,
      characters: script.characters.length,
      locations: script.locations.length,
      elements: script.elements.length,
      openTodos: script.todos.length,
      estimatedMinutes: estimateMinutes(Math.round(perScene.reduce((n, s) => n + s.pages, 0))),
      perScene,
    });
  },
);

server.registerTool(
  'get_todos',
  {
    title: 'Outstanding to-dos',
    description: 'Every unresolved [[todo: …]] note in the script, with the scene it sits in.',
    inputSchema: { path: z.string().describe('Path to the .fountain file') },
  },
  async ({ path }) => {
    const script = await library.parse(path);
    return json({
      count: script.todos.length,
      todos: script.todos.map((todo) => ({
        text: todo.text,
        scene: script.scenes.find((s) => s.id === todo.sceneId)?.heading ?? null,
      })),
    });
  },
);

server.registerTool(
  'search_script',
  {
    title: 'Search the script',
    description:
      'Finds text, optionally scoped to one element type or to a single character\'s dialogue. ' +
      'Returns matches with their scene and element type.',
    inputSchema: {
      path: z.string().describe('Path to the .fountain file'),
      query: z.string().describe('Text to find (case-insensitive)'),
      elementType: z
        .enum(['any', 'dialogue', 'action', 'sceneHeading', 'parenthetical', 'transition'])
        .optional()
        .describe('Restrict to one element type'),
      character: z.string().optional().describe("Restrict to this character's dialogue"),
    },
  },
  async ({ path, query, elementType, character }) => {
    const script = await library.parse(path);
    const needle = query.toLowerCase();
    const wanted = elementType && elementType !== 'any' ? elementType : null;
    const speaker = character?.toUpperCase();

    const matches = script.elements
      .filter((element) => {
        if (wanted && element.type !== wanted) return false;
        if (speaker) {
          if (element.type !== 'dialogue') return false;
          if (element.character !== speaker) return false;
        }
        return element.text.toLowerCase().includes(needle);
      })
      .map((element) => ({
        type: element.type,
        text: element.text,
        scene:
          script.scenes.filter((s) => s.from <= element.from).pop()?.heading ?? null,
      }));

    return json({ query, count: matches.length, matches: matches.slice(0, 100) });
  },
);

server.registerTool(
  'get_character_sides',
  {
    title: 'Character sides',
    description:
      'Only the scenes a given character appears in, as Fountain. Other characters\' lines are ' +
      'kept, because an actor needs the cues they come in on.',
    inputSchema: {
      path: z.string().describe('Path to the .fountain file'),
      character: z.string().describe('Character name'),
    },
  },
  async ({ path, character }) => {
    const script = await library.parse(path);
    const sides = serializeSides(script, character);
    if (!sides) throw new Error(`${character.toUpperCase()} does not speak in this script.`);
    return text(sides);
  },
);

/* ========================================================================== */
/* Writing — mechanical only                                                  */
/* ========================================================================== */

/**
 * Replaces the synopsis line under a scene heading, or inserts one.
 *
 * A synopsis is the writer's own outlining tool and never prints, which is why
 * it is safe for a tool to set. Nothing here touches a line of script.
 */
server.registerTool(
  'set_scene_synopsis',
  {
    title: 'Set a scene synopsis',
    description:
      'Writes the `= synopsis` line for a scene, replacing any existing one. Synopses are ' +
      'outlining notes and never appear in the formatted screenplay. This tool cannot modify ' +
      'action or dialogue.',
    inputSchema: {
      path: z.string().describe('Path to the .fountain file'),
      scene: z.string().describe('Scene number, heading substring, or id'),
      synopsis: z.string().describe('One or two sentences describing what happens'),
    },
  },
  async ({ path, scene: reference, synopsis }) => {
    const script = await library.parse(path);
    const { scene, index } = findScene(script, reference);

    const within = elementsIn(script, scene);
    const existing = within.find((e) => e.type === 'synopsis');
    const heading = script.elements[scene.elementIndex];
    if (!heading) throw new Error('Scene heading not found.');

    const line = `= ${synopsis.trim()}`;
    const source = script.source;

    const updated = existing
      ? source.slice(0, existing.from) + line + source.slice(existing.to)
      : source.slice(0, heading.to) + '\n\n' + line + source.slice(heading.to);

    await library.write(path, updated);

    return json({
      ok: true,
      scene: scene.heading,
      number: scene.sceneNumber ?? String(index + 1),
      action: existing ? 'replaced' : 'inserted',
      synopsis: synopsis.trim(),
    });
  },
);

server.registerTool(
  'set_scene_metadata',
  {
    title: 'Set scene metadata',
    description:
      'Sets A+ scene metadata — colour, status, beat, cast or an id — as Fountain notes under the ' +
      'heading. Notes are ignored by Highland, Beat and Final Draft, so the file stays portable. ' +
      'This tool cannot modify action or dialogue.',
    inputSchema: {
      path: z.string().describe('Path to the .fountain file'),
      scene: z.string().describe('Scene number, heading substring, or id'),
      color: z.enum(['none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']).optional(),
      status: z.enum(['draft', 'revised', 'locked']).optional(),
      beat: z.string().optional().describe('Story beat, e.g. "Midpoint"'),
      cast: z.array(z.string()).optional().describe('Non-speaking cast present in the scene'),
    },
  },
  async ({ path, scene: reference, color, status, beat, cast }) => {
    const script = await library.parse(path);
    const { scene } = findScene(script, reference);
    const heading = script.elements[scene.elementIndex];
    if (!heading) throw new Error('Scene heading not found.');

    const additions: string[] = [];
    if (color) additions.push(`[[color: ${color}]]`);
    if (status) additions.push(`[[status: ${status}]]`);
    if (beat) additions.push(`[[beat: ${beat}]]`);
    if (cast && cast.length > 0) additions.push(`[[CAST: ${cast.join(', ')}]]`);

    if (additions.length === 0) {
      throw new Error('Nothing to set. Provide at least one of color, status, beat or cast.');
    }

    // Existing notes for the same keys are dropped so this is a set, not an
    // append — otherwise repeated calls would stack contradictory metadata.
    const keys = additions.map((note) => /\[\[([^:]+):/.exec(note)?.[1]?.toLowerCase() ?? '');
    const existingNotes = script.elements.filter(
      (e) =>
        e.type === 'note' &&
        e.from > heading.to &&
        e.from < scene.to &&
        keys.some((key) => e.raw.toLowerCase().includes(`[[${key}:`)),
    );

    let source = script.source;
    for (let i = existingNotes.length - 1; i >= 0; i -= 1) {
      const note = existingNotes[i];
      if (!note) continue;
      // Take the newline with it so removal leaves no blank line behind.
      const end = source[note.to] === '\n' ? note.to + 1 : note.to;
      source = source.slice(0, note.from) + source.slice(end);
    }

    const reparsed = (await import('../../lib/fountain/parse')).parse(source);
    const freshHeading = reparsed.elements[findScene(reparsed, reference).scene.elementIndex];
    if (!freshHeading) throw new Error('Scene heading not found after cleanup.');

    const updated =
      source.slice(0, freshHeading.to) + '\n' + additions.join('\n') + source.slice(freshHeading.to);

    await library.write(path, updated);

    return json({ ok: true, scene: scene.heading, set: additions });
  },
);

server.registerTool(
  'add_note',
  {
    title: 'Add a note to a scene',
    description:
      'Appends a [[note]] under a scene heading — a production note, a question, or a [[todo:]]. ' +
      'Notes never print. This tool cannot modify action or dialogue.',
    inputSchema: {
      path: z.string().describe('Path to the .fountain file'),
      scene: z.string().describe('Scene number, heading substring, or id'),
      note: z.string().describe('The note text'),
      todo: z.boolean().optional().describe('Mark it as a to-do so it shows in the to-do panel'),
    },
  },
  async ({ path, scene: reference, note, todo }) => {
    const script = await library.parse(path);
    const { scene } = findScene(script, reference);
    const heading = script.elements[scene.elementIndex];
    if (!heading) throw new Error('Scene heading not found.');

    const body = todo ? `[[todo: ${note.trim()}]]` : `[[${note.trim()}]]`;
    const source = script.source;
    const updated = source.slice(0, heading.to) + '\n' + body + source.slice(heading.to);

    await library.write(path, updated);
    return json({ ok: true, scene: scene.heading, added: body });
  },
);

server.registerTool(
  'reformat_script',
  {
    title: 'Normalise spacing',
    description:
      'Rewrites the file with canonical Fountain spacing — correct blank lines between elements, ' +
      'cues kept attached to their dialogue. Element text is never altered, only the whitespace ' +
      'between elements.',
    inputSchema: { path: z.string().describe('Path to the .fountain file') },
  },
  async ({ path }) => {
    const before = await library.read(path);
    const script = await library.parse(path);
    const after = serialize(script);

    if (before === after) return json({ ok: true, changed: false });

    await library.write(path, after);
    return json({
      ok: true,
      changed: true,
      bytesBefore: before.length,
      bytesAfter: after.length,
    });
  },
);

/* ========================================================================== */

const transport = new StdioServerTransport();
await server.connect(transport);
