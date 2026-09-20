import { findNotes, parseTag } from './inline';
import type { SceneColor, SceneMeta, SceneStatus, SceneTag } from './types';

/**
 * Fountain+ — the A+ extensions.
 *
 * Every extension lives inside a Fountain note, `[[ … ]]`. That is the whole
 * design: Highland, Beat and Final Draft all understand notes and all ignore
 * them, so a file written here opens correctly everywhere and loses nothing
 * but the structure we layered on top. Nothing below changes how a script
 * reads on the page.
 *
 * Documented for writers in `docs/fountain-plus.md`.
 */

const SCENE_COLORS: readonly SceneColor[] = [
  'none',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'gray',
];

const SCENE_STATUSES: readonly SceneStatus[] = ['draft', 'revised', 'locked'];

/** `[[key: value]]` — the shape every non-tag extension takes. */
const KEYED_RE = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _-]*)\s*:\s*([\s\S]*)$/;

function asColor(value: string): SceneColor | undefined {
  const normalised = value.trim().toLowerCase();
  return (SCENE_COLORS as readonly string[]).includes(normalised)
    ? (normalised as SceneColor)
    : undefined;
}

function asStatus(value: string): SceneStatus | undefined {
  const normalised = value.trim().toLowerCase();
  return (SCENE_STATUSES as readonly string[]).includes(normalised)
    ? (normalised as SceneStatus)
    : undefined;
}

/** `Vilde, Noa-Li` → `['Vilde', 'Noa-Li']`. */
function asList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Reads every A+ extension out of a chunk of source.
 *
 * `source` is the scene heading line plus any note-only lines directly under
 * it. A note we do not recognise is left alone — it stays an ordinary writer's
 * note and shows up in the margin, which is the correct outcome for
 * `[[remember to call the location scout]]`.
 */
export function readSceneMeta(source: string): SceneMeta {
  const meta: SceneMeta = {};
  const tags: SceneTag[] = [];
  const todos: string[] = [];

  for (const note of findNotes(source)) {
    if (note.isTag) {
      const tag = parseTag(note.content);
      if (tag) tags.push({ ...tag, from: note.from, to: note.to });
      continue;
    }

    const match = KEYED_RE.exec(note.content.trim());
    if (!match) continue;

    const key = (match[1] ?? '').trim().toLowerCase();
    const value = (match[2] ?? '').trim();
    if (!value) continue;

    switch (key) {
      case 'id':
        meta.sceneId = value;
        break;
      case 'cast':
        meta.cast = asList(value);
        break;
      case 'location':
        meta.locationNote = value;
        break;
      case 'color':
      case 'colour':
      case 'färg': {
        const color = asColor(value);
        if (color) meta.color = color;
        break;
      }
      case 'status':
      case 'statuss':
      case 'status:': {
        const status = asStatus(value);
        if (status) meta.status = status;
        break;
      }
      case 'beat':
        meta.beat = value;
        break;
      case 'todo':
      case 'att göra':
        todos.push(value);
        break;
      case 'day':
      case 'dag': {
        const day = /^\d{1,4}$/.test(value) ? Number(value) : NaN;
        if (day >= 1) meta.day = day;
        break;
      }
      case 'time':
      case 'tid': {
        const tick = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
        if (tick >= 0 && tick < 24000) meta.time = tick;
        break;
      }
      case 'server':
        meta.server = value;
        break;
      case 'recording':
      case 'inspelning':
        meta.recording = value;
        break;
      case 'take':
      case 'tagning': {
        const take = /^\d{1,3}$/.test(value) ? Number(value) : NaN;
        if (take >= 1) meta.take = take;
        break;
      }
      case 'at':
      case 'start':
        if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value)) meta.at = value;
        break;
      case 'pov':
        meta.pov = value;
        break;
      case 'energy':
      case 'energi': {
        const energy = /^\d{1,2}$/.test(value) ? Number(value) : NaN;
        if (energy >= 1 && energy <= 10) meta.energy = energy;
        break;
      }
      default:
        // An unrecognised key is a writer's note, not a malformed extension.
        break;
    }
  }

  if (tags.length > 0) meta.tags = tags;
  if (todos.length > 0) meta.todos = todos;

  return meta;
}

/* ========================================================================== */
/* Writing extensions back out                                                */
/* ========================================================================== */

/** Renders one extension as the note it is stored as. */
export function formatExtension(key: string, value: string): string {
  return `[[${key}: ${value}]]`;
}

export function formatTag(kind: string, value: string): string {
  return `[[#${kind} ${value}]]`;
}

/**
 * Generates a stable scene id.
 *
 * Short and URL-safe, because it ends up in the document the writer reads in
 * other apps. Collisions inside one script are what matter, and 36^6 is far
 * more room than any screenplay needs.
 */
export function generateSceneId(): string {
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `s_${random}`;
}
