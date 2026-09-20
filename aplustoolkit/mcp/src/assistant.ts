import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { parse } from '../../packages/fountain/parse';
import type { Script, SceneIndexEntry } from '../../packages/fountain/types';
import { onlyFormattingChanged, type SceneRef, type Suggestion } from '../../packages/bridge/protocol';
import { lintScript } from '../../packages/production/lint';
import {
  characterLines,
  elementsOf,
  scheduleGroups,
  sceneDifficulty,
  structureReport,
} from '../../packages/production/analysis';
import type { Bridge } from './bridge';
import { CRAFT_SHORT, RULES } from './craft';
import type { Library } from './library';

/**
 * The assistant tools.
 *
 * The split that matters: **Claude does the thinking, the app does the
 * writing-down.** These tools give Claude the facts (what is open, what a
 * scene says, how long things are) and give it one way to hand something
 * back: a *suggestion*, which lands in the app as a card the writer accepts
 * or discards.
 *
 * One of them, `suggest_rewrite`, can change the writer's own words — but
 * only as a diff the writer has to accept, and only when they asked for it.
 * That is the whole safety model: the boundary is not "the assistant cannot
 * write", it is "nothing reaches the page without a click", and one undo
 * takes it back. The craft rules in `craft.ts` ride along with it.
 *
 * If no app is connected, or the writer has cards turned off, the suggestion
 * is returned as plain structured data so Claude can say it in the chat.
 */

interface Ctx {
  server: McpServer;
  bridge: Bridge;
  library: Library;
  findScene: (script: Script, reference: string) => { scene: SceneIndexEntry; index: number };
}

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

const SCENE = z.string().describe('Scene number, heading substring or id. Omit to use the scene the writer is in.');
const PATH = z.string().optional().describe('A .fountain file. Omit to use the script open in A+ Write.');

export function registerAssistant({ server, bridge, library, findScene }: Ctx): void {
  /* ------------------------------------------------------------- sources */

  async function open(path?: string): Promise<{ source: string; script: Script; from: 'app' | 'file'; title: string }> {
    if (path) {
      const source = await library.read(path);
      return { source, script: parse(source), from: 'file', title: path };
    }
    const app = bridge.appState;
    if (!app) {
      throw new Error(
        'No script is open in A+ Write, and no path was given. Ask the writer to open their script in A+ Write ' +
          '(desktop app, or the web app on localhost), or give a path from list_scripts.',
      );
    }
    return { source: app.source, script: parse(app.source), from: 'app', title: app.title };
  }

  /** The scene a reference points at, defaulting to where the caret is. */
  function pick(script: Script, reference: string | undefined): { scene: SceneIndexEntry; index: number } {
    if (reference) return findScene(script, reference);
    const caret = bridge.appState?.caret ?? 0;
    const index = Math.max(0, script.scenes.findIndex((s) => caret >= s.from && caret < s.to));
    const scene = script.scenes[index];
    if (!scene) throw new Error('The script has no scenes yet.');
    return { scene, index };
  }

  const refOf = (scene: SceneIndexEntry, index: number): SceneRef => ({ index, heading: scene.heading });

  /** Sends a card if an app is listening; otherwise hands the data back. */
  function deliver(suggestion: Suggestion, label: string) {
    const card = bridge.suggest(suggestion, label);
    if (card) {
      return json({
        delivered: true,
        as: 'card in A+ Write',
        cardId: card.id,
        note: 'The writer sees it in the suggestions panel and chooses Use or Discard. Nothing has been changed in the script.',
      });
    }
    return json({
      delivered: false,
      reason: bridge.connected
        ? 'The writer has suggestion cards turned off.'
        : 'No A+ Write app is connected.',
      instruction: 'Present this to the writer in the chat instead.',
      suggestion,
    });
  }

  /* ---------------------------------------------------------- what is open */

  server.registerTool(
    'get_open_script',
    {
      title: 'What is open in A+ Write',
      description:
        'The script the writer has open right now: title, the scene the caret is in, any selected text, page size and language. ' +
        'Call this first when the writer says "this scene" or "what I selected". Fails if no app is connected.',
      inputSchema: {},
    },
    async () => {
      const app = bridge.appState;
      if (!app) {
        return json({ connected: false, hint: 'Ask the writer to open A+ Write, or work from a file with list_scripts.' });
      }
      const script = parse(app.source);
      const index = Math.max(0, script.scenes.findIndex((s) => app.caret >= s.from && app.caret < s.to));
      const scene = script.scenes[index];
      return json({
        connected: true,
        title: app.title,
        scenes: script.scenes.length,
        pageSize: app.pageSize,
        language: app.locale,
        suggestionCards: app.cards,
        currentScene: scene ? { index, number: scene.sceneNumber ?? String(index + 1), heading: scene.heading } : null,
        selection: app.selection.text ? app.selection : null,
      });
    },
  );

  server.registerTool(
    'get_current_scene',
    {
      title: 'The scene the writer is in',
      description:
        'The full text of one scene with its parsed elements and metadata. With no `scene`, the scene the caret is in. ' +
        'Use before suggesting anything about a scene.',
      inputSchema: { scene: SCENE.optional(), path: PATH },
    },
    async ({ scene: reference, path }) => {
      const { source, script } = await open(path);
      const { scene, index } = pick(script, reference);
      return json({
        index,
        number: scene.sceneNumber ?? String(index + 1),
        heading: scene.heading,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        synopsis: scene.synopsis,
        speaking: scene.speaking,
        meta: scene.meta,
        source: source.slice(scene.from, scene.to).trimEnd(),
        previousScene: script.scenes[index - 1]?.synopsis ?? script.scenes[index - 1]?.heading ?? null,
        nextScene: script.scenes[index + 1]?.synopsis ?? script.scenes[index + 1]?.heading ?? null,
      });
    },
  );

  server.registerTool(
    'get_selection',
    {
      title: 'What the writer has selected',
      description: 'The text the writer has selected in A+ Write, with the scene it is in. Use for "what do you think of this?".',
      inputSchema: {},
    },
    async () => {
      const app = bridge.appState;
      if (!app || !app.selection.text) return json({ selected: false });
      const script = parse(app.source);
      const scene = script.scenes.find((s) => app.selection.from >= s.from && app.selection.from < s.to);
      return json({ selected: true, text: app.selection.text, scene: scene?.heading ?? null, sceneSource: scene ? app.source.slice(scene.from, scene.to).trimEnd() : null });
    },
  );

  /* ----------------------------------------------------------------- facts */

  server.registerTool(
    'get_difficulty',
    {
      title: 'Scene difficulty',
      description:
        'A basic difficulty rating per scene — easy, medium or hard — with the reasons (night, exterior, rain, stunts, crowds, animals …). ' +
        'Keyword-based, so treat it as a prompt to look twice, not a verdict.',
      inputSchema: { path: PATH },
    },
    async ({ path }) => json(sceneDifficulty((await open(path)).script)),
  );

  server.registerTool(
    'get_structure',
    {
      title: 'Structure and pacing facts',
      description:
        'Real page numbers: where 25%, 50% and 75% fall, each scene\'s start page and length in eighths, dialogue ratio, the longest scenes, ' +
        'stretches that are almost all dialogue, and any [[beat:]] markers. Use for structure and pacing questions.',
      inputSchema: { path: PATH },
    },
    async ({ path }) => {
      const { script } = await open(path);
      return json(structureReport(script, bridge.appState?.pageSize ?? 'a4'));
    },
  );

  server.registerTool(
    'get_schedule_groups',
    {
      title: 'Scenes grouped for scheduling',
      description:
        'Scenes grouped by location with day/night, cast and page length in eighths — the raw material for a shooting schedule. ' +
        'Arrange these into shooting days yourself and deliver the plan with suggest_document.',
      inputSchema: { path: PATH },
    },
    async ({ path }) => json(scheduleGroups((await open(path)).script, bridge.appState?.pageSize ?? 'a4')),
  );

  server.registerTool(
    'get_character_lines',
    {
      title: 'Everything one character says',
      description:
        'Every line a character speaks, with parentheticals and the line they answer. Use for "does this sound like her?", ' +
        'character bibles, casting calls and continuity checks.',
      inputSchema: { character: z.string(), path: PATH },
    },
    async ({ character, path }) => {
      const lines = characterLines((await open(path)).script, character);
      if (lines.length === 0) throw new Error(`${character.toUpperCase()} does not speak in this script.`);
      return json({ character: character.toUpperCase(), count: lines.length, lines });
    },
  );

  /* --------------------------------------------------------- format check */

  server.registerTool(
    'check_format',
    {
      title: 'Check the Fountain formatting',
      description:
        'Finds formatting mistakes — a parenthetical under its dialogue instead of above, a heading with no blank line after it, ' +
        'a character cue in lower case — and sends each fix to the writer as a +/− diff card. It only ever changes formatting, never a word. ' +
        'Purely mechanical; no judgement involved.',
      inputSchema: { path: PATH },
    },
    async ({ path }) => {
      const { source, from } = await open(path);
      const issues = lintScript(source, (rule) => ({
        title: rule,
        explanation: FORMAT_EXPLANATIONS[rule],
      }));
      if (issues.length === 0) return json({ issues: 0, message: 'No formatting problems found.' });

      let sent = 0;
      if (from === 'app') {
        for (const issue of issues) {
          if (bridge.suggest({ kind: 'format', ...issue, title: FORMAT_TITLES[issue.rule] }, FORMAT_TITLES[issue.rule])) sent += 1;
        }
      }
      return json({ issues: issues.length, sentAsCards: sent, ...(sent === 0 ? { issues_detail: issues } : {}) });
    },
  );

  /* ---------------------------------------------------------- suggestions */

  server.registerTool(
    'suggest_shotlist',
    {
      title: 'Suggest a shotlist',
      description:
        'Deliver a shotlist for one scene to the writer as a card. YOU design the coverage — read the scene with get_current_scene first, ' +
        'think about what the scene needs and why, then call this with the shots. Number shots 1, 2, 3 … Give a short `description` per shot ' +
        'saying what it shows and why. Choose sensible lenses (in mm) and movement; leave angle/movement out if unsure. ' +
        'The writer accepts or discards it; nothing in the script changes.',
      inputSchema: {
        scene: SCENE.optional(),
        path: PATH,
        approach: z.string().optional().describe('One or two sentences on how the scene is covered.'),
        shots: z
          .array(
            z.object({
              number: z.string(),
              size: z.string().describe('EWS, WS, MWS, MS, MCU, CU, ECU, INSERT, OTS, POV or TWO'),
              angle: z.string().optional(),
              movement: z.string().optional(),
              lens: z.number().optional().describe('Focal length in mm'),
              description: z.string(),
              subjects: z.array(z.string()).optional(),
              notes: z.string().optional(),
            }),
          )
          .min(1),
      },
    },
    async ({ scene: reference, path, approach, shots }) => {
      const { script } = await open(path);
      const { scene, index } = pick(script, reference);
      return deliver(
        { kind: 'shotlist', shotlist: { scene: refOf(scene, index), shots, ...(approach ? { approach } : {}) } },
        `Shotlist · ${scene.heading}`,
      );
    },
  );

  server.registerTool(
    'suggest_breakdown',
    {
      title: 'Suggest breakdown tags for a scene',
      description:
        'Deliver production tags for one scene — props, wardrobe, sound effects, vehicles, set dressing, extras, makeup — as a card. ' +
        'Read the scene first; only tag what the text actually calls for. Tags are written into the script as `[[#prop Revolver]]` notes ' +
        'when the writer accepts, which other apps ignore.',
      inputSchema: {
        scene: SCENE.optional(),
        path: PATH,
        tags: z
          .array(z.object({ kind: z.string().describe('prop, wardrobe, sfx, vehicle, set, extras, makeup, …'), value: z.string() }))
          .min(1),
      },
    },
    async ({ scene: reference, path, tags }) => {
      const { script } = await open(path);
      const { scene, index } = pick(script, reference);
      return deliver({ kind: 'tags', scene: refOf(scene, index), tags }, `Breakdown · ${scene.heading}`);
    },
  );

  server.registerTool(
    'suggest_synopsis',
    {
      title: 'Suggest a scene synopsis',
      description:
        'Deliver a one-or-two-sentence synopsis for a scene as a card. Describe what happens and why it matters; do not quote or rewrite the scene. ' +
        'On acceptance it becomes the scene\'s `= synopsis` line, which never prints.',
      inputSchema: { scene: SCENE.optional(), path: PATH, text: z.string() },
    },
    async ({ scene: reference, path, text }) => {
      const { script } = await open(path);
      const { scene, index } = pick(script, reference);
      return deliver({ kind: 'synopsis', scene: refOf(scene, index), text }, `Synopsis · ${scene.heading}`);
    },
  );

  server.registerTool(
    'suggest_metadata',
    {
      title: 'Suggest scene metadata',
      description: 'Deliver a colour, status, story beat or cast list for a scene as a card. Stored as notes under the heading.',
      inputSchema: {
        scene: SCENE.optional(),
        path: PATH,
        color: z.enum(['none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']).optional(),
        status: z.enum(['draft', 'revised', 'locked']).optional(),
        beat: z.string().optional(),
        cast: z.array(z.string()).optional(),
      },
    },
    async ({ scene: reference, path, ...meta }) => {
      const { script } = await open(path);
      const { scene, index } = pick(script, reference);
      return deliver({ kind: 'metadata', scene: refOf(scene, index), ...meta }, `Scene info · ${scene.heading}`);
    },
  );

  server.registerTool(
    'suggest_note',
    {
      title: 'Leave a note for the writer',
      description:
        'Deliver a note or to-do as a card — a continuity problem, a question, something to check. It becomes a `[[note]]` or `[[todo:]]` under the ' +
        'scene heading. This is how to flag a problem in the script *without touching it*.',
      inputSchema: { scene: SCENE.optional(), path: PATH, text: z.string(), todo: z.boolean().optional() },
    },
    async ({ scene: reference, path, text, todo }) => {
      const { script } = await open(path);
      const { scene, index } = pick(script, reference);
      return deliver({ kind: 'note', scene: refOf(scene, index), text, ...(todo ? { todo } : {}) }, `Note · ${scene.heading}`);
    },
  );

  server.registerTool(
    'suggest_format_fix',
    {
      title: 'Suggest a formatting fix',
      description:
        'Deliver a formatting-only edit as a +/− diff card. `before` must be an exact excerpt of the script. `after` may change spacing, case, ' +
        'line order and Fountain markup — but NOT a single word; anything else is refused. For routine problems prefer check_format.',
      inputSchema: {
        path: PATH,
        title: z.string(),
        explanation: z.string(),
        before: z.string(),
        after: z.string(),
      },
    },
    async ({ path, title, explanation, before, after }) => {
      const { source } = await open(path);
      if (!onlyFormattingChanged(before, after)) {
        throw new Error(
          'Refused: this changes the words of the script, and this tool only fixes formatting. If the writer asked for a ' +
            'rewrite, use suggest_rewrite. If they did not, say it in the chat or leave a note with suggest_note.',
        );
      }
      const near = source.indexOf(before);
      if (near < 0) throw new Error('`before` is not an exact excerpt of the current script. Copy it verbatim from get_current_scene.');
      return deliver({ kind: 'format', title, explanation, before, after, near }, title);
    },
  );

  server.registerTool(
    'suggest_rewrite',
    {
      title: 'Suggest a rewrite',
      description:
        'Deliver a rewrite as a +/− diff card. Unlike suggest_format_fix this tool CAN change words: it is for the dialogue and action ' +
        'rewrites the writer explicitly asked for. `before` must be an EXACT excerpt copied verbatim from the script — read the scene ' +
        'with get_current_scene first. The writer sees both versions in a red/green diff and must click "Use" before anything changes. ' +
        'Never call this speculatively, and never to "improve" something they did not ask about. ' +
        CRAFT_SHORT,
      inputSchema: {
        path: PATH,
        scene: SCENE.optional(),
        title: z.string().describe('Short label, e.g. "Omskriv Vilas replik"'),
        explanation: z.string().describe('One sentence explaining what changed and why'),
        before: z.string().describe('Exact text from the script to replace'),
        after: z.string().describe('The rewritten replacement text'),
      },
    },
    async ({ path, scene: sceneRef, title, explanation, before, after }) => {
      const { source, script } = await open(path);
      if (!source.includes(before)) {
        throw new Error('`before` is not found in the current script. Copy it verbatim from get_current_scene or get_scene.');
      }
      let ref: SceneRef | undefined;
      if (sceneRef) {
        const { scene, index } = pick(script, sceneRef);
        ref = refOf(scene, index);
      }
      return deliver({ kind: 'rewrite', scene: ref, title, explanation, before, after }, title);
    },
  );

  server.registerTool(
    'suggest_character_profile',
    {
      title: 'Suggest a character profile',
      description:
        'Deliver a character-bible entry as a card, built from what the script actually says. Read every line with get_character_lines first. ' +
        'Include `evidence` — short quotes or scene references — so the writer can check the profile against their own script. ' +
        'Also good as the basis for a casting call: describe the role, not the actor.',
      inputSchema: {
        name: z.string(),
        age: z.string().optional(),
        summary: z.string().optional(),
        traits: z.array(z.string()).optional(),
        wants: z.string().optional(),
        needs: z.string().optional(),
        arc: z.string().optional(),
        relationships: z.array(z.object({ name: z.string(), relation: z.string() })).optional(),
        evidence: z.array(z.string()).optional(),
      },
    },
    async ({ name, ...profile }) => deliver({ kind: 'character', name: name.toUpperCase(), profile }, `Character · ${name.toUpperCase()}`),
  );

  server.registerTool(
    'suggest_document',
    {
      title: 'Deliver a written result',
      description:
        'Deliver anything that is prose *about* the script rather than part of it — a logline, a structure analysis, a shooting-schedule plan, ' +
        'a continuity report, a casting call, a "what could happen next" — as a card the writer can read and keep. It is never inserted into the script. ' +
        'Write it in the writer\'s language. Markdown is fine.',
      inputSchema: { title: z.string(), body: z.string().describe('Markdown') },
    },
    async ({ title, body }) => deliver({ kind: 'document', title, body }, title),
  );

  server.registerTool(
    'focus_scene',
    {
      title: 'Show a scene in the app',
      description: 'Ask the app to scroll to a scene, so "look at scene 12" lands where you are talking about. Does nothing if no app is connected.',
      inputSchema: { scene: SCENE, path: PATH },
    },
    async ({ scene: reference, path }) => {
      const { script } = await open(path);
      const { scene, index } = pick(script, reference);
      const sent = bridge.focus(refOf(scene, index));
      return json({ focused: sent, scene: scene.heading });
    },
  );

  registerPrompts(server);
}

/* ========================================================================== */

const FORMAT_TITLES = {
  trailingParenthetical: 'Parenthetical is under the dialogue',
  orphanParenthetical: 'Parenthetical is cut off from its speech',
  headingSpacing: 'Scene heading needs a blank line after it',
  cueCase: 'Character name should be in capitals',
  transitionCase: 'Transition should be in capitals',
} as const;

const FORMAT_EXPLANATIONS = {
  trailingParenthetical: 'A parenthetical directs the line after it, so it belongs between the character name and the dialogue.',
  orphanParenthetical: 'The blank line makes this parenthetical read as scene description. Joined to its speech it directs the line.',
  headingSpacing: 'Other Fountain apps only recognise a scene heading when a blank line follows it.',
  cueCase: 'This name is a character in the script, but in lower case it reads as action, so the dialogue below loses its speaker.',
  transitionCase: 'Only an upper-case line ending in TO: is read as a transition.',
} as const;

/* ========================================================================== */
/* Prompts — ready-made commands in Claude Desktop's menu                     */
/* ========================================================================== */

function registerPrompts(server: McpServer): void {
  const sceneArg = { scene: z.string().optional().describe('Scene number or heading. Leave empty for the scene you are in.') };
  const msg = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });

  server.registerPrompt(
    'shotlist',
    { title: 'Shotlist för scenen', description: 'Föreslå en shotlist med storlek, vinkel, rörelse och objektiv.', argsSchema: sceneArg },
    ({ scene }) =>
      msg(
        `Make a shotlist for ${scene ? `scene "${scene}"` : 'the scene I am in'}. First call get_current_scene. Think about what the scene is about ` +
          `and how to cover it: master, coverage, inserts, and what each shot is for. Then call suggest_shotlist with numbered shots, each with size, ` +
          `a sensible lens in mm, movement if it earns its place, and a short description of what it shows and why. ${RULES}`,
      ),
  );

  server.registerPrompt(
    'whats_next',
    { title: 'Vad händer sen?', description: 'Tre riktningar för nästa scen, med motivering.', argsSchema: {} },
    () =>
      msg(
        `Read my script (get_open_script, then get_structure and the last few scenes with get_current_scene). Give me three different directions for what ` +
          `could happen next, each in two or three sentences with the reason it fits what has been set up. Do not write the scene. Deliver with suggest_document ` +
          `titled "What happens next". ${RULES}`,
      ),
  );

  server.registerPrompt(
    'breakdown',
    { title: 'Breakdown av scenen', description: 'Föreslå rekvisita, kostym, ljud och statister.', argsSchema: sceneArg },
    ({ scene }) =>
      msg(
        `Break down ${scene ? `scene "${scene}"` : 'the scene I am in'} for production. Read it with get_current_scene, then call suggest_breakdown with ` +
          `props, wardrobe, sound effects, vehicles, set dressing, extras and makeup that the text calls for. Only what the scene actually needs. ${RULES}`,
      ),
  );

  server.registerPrompt(
    'structure',
    { title: 'Struktur och tempo', description: 'Var akterna och vändpunkterna hamnar, och var det går långsamt.', argsSchema: {} },
    () =>
      msg(
        `Call get_structure. Tell me where the acts and midpoint fall against the real page numbers, which stretches drag or are all talk, and which scenes ` +
          `look too long or too short. Be specific about scenes and pages. Deliver as suggest_document titled "Structure and pacing". ${RULES}`,
      ),
  );

  server.registerPrompt(
    'voice_check',
    { title: 'Låter repliken som rollen?', description: 'Jämför det markerade med hur rollen pratar i resten av manuset.', argsSchema: { character: z.string().optional() } },
    ({ character }) =>
      msg(
        `Call get_selection. Then call get_character_lines for ${character ? `"${character}"` : 'the character who speaks the selected line'} and compare: ` +
          `does the selected line sound like them — vocabulary, rhythm, how they answer? Quote the lines you compare with. Feedback only: ` +
          `do not rewrite the line unless I ask you to, and then use suggest_rewrite. ${RULES}`,
      ),
  );

  server.registerPrompt(
    'logline',
    { title: 'Logline och synopsis', description: 'Förslag på logline, och synopsis per scen.', argsSchema: { perScene: z.string().optional().describe('"ja" för synopsis per scen') } },
    ({ perScene }) =>
      msg(
        `Read the script (get_structure, and get_current_scene for the scenes you need). Suggest three loglines with suggest_document. ` +
          `${perScene ? 'Then call suggest_synopsis for every scene that has no synopsis yet. ' : ''}${RULES}`,
      ),
  );

  server.registerPrompt(
    'schedule',
    { title: 'Inspelningsschema', description: 'Gruppera scener till inspelningsdagar.', argsSchema: { days: z.string().optional().describe('Antal dagar, om du har en gräns') } },
    ({ days }) =>
      msg(
        `Call get_schedule_groups and get_difficulty. Propose a shooting schedule${days ? ` over ${days} days` : ''}: group by location, keep night shoots ` +
          `together, put hard scenes where there is slack, and keep each actor's days few. Show the reasoning for each day and total page-eighths. ` +
          `Deliver as suggest_document titled "Shooting schedule". ${RULES}`,
      ),
  );

  server.registerPrompt(
    'continuity',
    { title: 'Kontinuitetskoll', description: 'Hitta motsägelser i namn, tid och vem som vet vad.', argsSchema: {} },
    () =>
      msg(
        `Read the whole script (read_script if it is short, otherwise get_structure and the scenes in turn). Look for contradictions: names and ages, ` +
          `day and night in the wrong order, things that appear before they exist, characters who know what they should not. For each, call suggest_note ` +
          `on the scene where it goes wrong, with what conflicts with what and where. Never change the script. ${RULES}`,
      ),
  );

  server.registerPrompt(
    'difficulty',
    { title: 'Svåra scener', description: 'Vad gör scener dyra eller svåra att filma.', argsSchema: {} },
    () =>
      msg(
        `Call get_difficulty. Summarise the hardest scenes, why each is hard, and one cheaper way to get the same effect where there is one. Short. ` +
          `Deliver as suggest_document titled "Difficult scenes". ${RULES}`,
      ),
  );

  server.registerPrompt(
    'casting_call',
    { title: 'Rollbeskrivning / casting call', description: 'Bygg en rollprofil och en castingannons från manuset.', argsSchema: { character: z.string() } },
    ({ character }) =>
      msg(
        `Call get_character_lines for "${character}" and read the scenes they are in. Call suggest_character_profile with what the script shows, ` +
          `including evidence quotes. Then call suggest_document with a casting call: the role described by who they are and what the part demands ` +
          `(age range, physicality, emotional range, language), not by a named actor. ${RULES}`,
      ),
  );

  server.registerPrompt(
    'format_check',
    { title: 'Kolla formateringen', description: 'Hitta och laga formatfel. Ändrar aldrig ett ord.', argsSchema: {} },
    () => msg(`Call check_format and tell me what it found. Formatting only; do not touch any words. ${RULES}`),
  );
}
