import { findNotes } from './inline';
import type {
  CharacterEntry,
  Element,
  LocationEntry,
  SceneIndexEntry,
  Script,
} from './types';

/**
 * The derived indexes: scenes, characters, locations and to-dos.
 *
 * These are what the navigator, the index cards, the reports and the
 * autocomplete all read. They are rebuilt from the element list rather than
 * maintained alongside it, so there is exactly one way for the app to be
 * wrong about the script — and it is the same way the script itself is wrong.
 */

export type Indexes = Pick<Script, 'scenes' | 'characters' | 'locations' | 'todos'>;

const TODO_RE = /^\s*(?:todo|att göra)\s*:\s*([\s\S]+)$/i;

export function buildIndexes(elements: Element[]): Indexes {
  const scenes: SceneIndexEntry[] = [];
  const characters = new Map<string, CharacterEntry>();
  const locations = new Map<string, LocationEntry>();
  const todos: Script['todos'] = [];

  /* ---------------------------------------------------------------- scenes */

  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i];
    if (element?.type !== 'sceneHeading') continue;

    scenes.push({
      // A scene with no `[[id:]]` yet gets a positional fallback so the
      // navigator still has a key. The editor writes a real id on first edit.
      id: element.meta.sceneId ?? `#${scenes.length}`,
      elementIndex: i,
      sceneNumber: element.sceneNumber,
      heading: element.text,
      location: element.location,
      timeOfDay: element.timeOfDay,
      prefix: element.prefix,
      from: element.from,
      to: element.to,
      speaking: [],
      synopsis: null,
      meta: element.meta,
    });
  }

  // A scene runs to the start of the next one, or to the end of the script.
  for (let s = 0; s < scenes.length; s += 1) {
    const scene = scenes[s] as SceneIndexEntry;
    const next = scenes[s + 1];
    scene.to = next ? next.from : (elements[elements.length - 1]?.to ?? scene.to);
  }

  /** Which scene an offset falls in, or -1 before the first heading. */
  const sceneAt = (offset: number): number => {
    for (let s = scenes.length - 1; s >= 0; s -= 1) {
      if (offset >= (scenes[s] as SceneIndexEntry).from) return s;
    }
    return -1;
  };

  /* ------------------------------------------- characters, locations, todos */

  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i];
    if (!element) continue;

    const sceneIndex = sceneAt(element.from);
    const scene = sceneIndex >= 0 ? scenes[sceneIndex] : undefined;

    // To-dos are collected wherever they appear, not only on headings, so a
    // note left mid-dialogue still blocks the export warning.
    for (const note of findNotes(element.raw, element.from)) {
      const match = TODO_RE.exec(note.content);
      if (!match) continue;
      todos.push({
        text: (match[1] ?? '').trim(),
        from: note.from,
        to: note.to,
        sceneId: scene?.id ?? null,
      });
    }

    if (element.type === 'sceneHeading' && element.location) {
      const key = element.location.toUpperCase();
      const entry = locations.get(key) ?? {
        name: key,
        prefixes: [],
        timesOfDay: [],
        scenes: [],
      };

      if (element.prefix && !entry.prefixes.includes(element.prefix)) {
        entry.prefixes.push(element.prefix);
      }
      if (element.timeOfDay && !entry.timesOfDay.includes(element.timeOfDay)) {
        entry.timesOfDay.push(element.timeOfDay);
      }
      if (sceneIndex >= 0 && !entry.scenes.includes(sceneIndex)) {
        entry.scenes.push(sceneIndex);
      }

      locations.set(key, entry);
      continue;
    }

    if (element.type === 'synopsis' && scene && scene.synopsis === null) {
      scene.synopsis = element.text;
      continue;
    }

    if (element.type === 'character') {
      const name = element.name;
      const entry = characters.get(name) ?? {
        name,
        cues: 0,
        words: 0,
        scenes: [],
        extensions: [],
        firstAt: element.from,
      };

      entry.cues += 1;
      for (const extension of element.extensions) {
        if (!entry.extensions.includes(extension)) entry.extensions.push(extension);
      }
      if (sceneIndex >= 0 && !entry.scenes.includes(sceneIndex)) {
        entry.scenes.push(sceneIndex);
      }

      characters.set(name, entry);

      if (scene && !scene.speaking.includes(name)) scene.speaking.push(name);
      continue;
    }

    // Parentheticals are performance notes, not spoken words, so they are
    // deliberately excluded from the word count a report shows.
    if (element.type === 'dialogue') {
      const entry = characters.get(element.character);
      if (entry) entry.words += countWords(element.text);
    }
  }

  return {
    scenes,
    characters: [...characters.values()].sort((a, b) => b.cues - a.cues || a.name.localeCompare(b.name)),
    locations: [...locations.values()].sort((a, b) => a.name.localeCompare(b.name)),
    todos,
  };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
