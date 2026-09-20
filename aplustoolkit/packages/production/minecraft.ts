import type { Script, SceneIndexEntry } from '../fountain/types';

/**
 * Helpers for productions shot inside a game and cut afterwards, the way a scripted Minecraft SMP
 * is made with a replay tool such as Flashback: the scene is performed and recorded once, and the
 * camera, the time of day and the speed are worked out on the recording later.
 *
 * Everything here reads what the script already says (`[[time: 13000]]`, `[[recording: …]]`, the
 * dialogue itself) and turns it into something to shoot or record from.
 */

/* ---------------------------------------------------------------- game time */

/**
 * The game clock for a heading's time of day, in ticks: 0 is sunrise, 6000 noon, 12000 sunset,
 * 18000 midnight. A round number that lands well inside the part of the day, not an exact one.
 */
export function gameTimeFor(timeOfDay: string | null | undefined): number | null {
  const word = (timeOfDay ?? '').trim().toLocaleUpperCase();
  if (!word) return null;
  if (/MIDNATT|MIDNIGHT/.test(word)) return 18000;
  if (/MORGON|MORNING|DAWN|SUNRISE|SOLUPPGÅNG/.test(word)) return 23500;
  if (/KVÄLL|EVENING|DUSK|SUNSET|SOLNEDGÅNG|SKYMNING/.test(word)) return 12500;
  if (/MIDDAG|NOON/.test(word)) return 6000;
  if (/NATT|NIGHT/.test(word)) return 15000;
  if (/DAG|DAY|AFTERNOON|EFTERMIDDAG/.test(word)) return 3000;
  return null;
}

export type DayPart = 'sunrise' | 'day' | 'sunset' | 'night';

/** Which part of the game day a tick falls in, for showing what a number means. */
export function dayPart(tick: number): DayPart {
  const t = ((Math.round(tick) % 24000) + 24000) % 24000;
  if (t >= 23000 || t < 1000) return 'sunrise';
  if (t < 12000) return 'day';
  if (t < 13000) return 'sunset';
  return 'night';
}

/** A tick as the hour Minecraft shows on its clock: tick 0 is 06:00. */
export function clockFor(tick: number): string {
  const minutes = Math.round((((tick % 24000) + 24000) % 24000) * 0.06) + 6 * 60;
  const wrapped = minutes % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------ recording log */

/** Seconds into a recording from `12:30` or `1:02:30`. Anything else sorts last. */
export function seconds(at: string | undefined): number {
  const parts = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(at ?? '');
  if (!parts) return Number.MAX_SAFE_INTEGER;
  const [, a, b, c] = parts;
  return c === undefined ? Number(a) * 60 + Number(b) : Number(a) * 3600 + Number(b) * 60 + Number(c);
}

export interface LoggedScene {
  /** Position in the script, 0-based. */
  index: number;
  heading: string;
  take: number | null;
  at: string | null;
  server: string | null;
  pov: string | null;
}

export interface RecordingGroup {
  /** The recording's name, or null for scenes with none yet. */
  recording: string | null;
  scenes: LoggedScene[];
}

/**
 * The scenes grouped by the recording they are on, each recording's scenes in the order they
 * appear in it. Recordings come in the order of the script's first scene in them, and the
 * scenes with no recording yet come last: that is what is left to shoot.
 */
export function recordingLog(scenes: SceneIndexEntry[]): RecordingGroup[] {
  const groups = new Map<string | null, LoggedScene[]>();
  const order: (string | null)[] = [];

  scenes.forEach((scene, index) => {
    const recording = scene.meta.recording?.trim() || null;
    if (!groups.has(recording)) {
      groups.set(recording, []);
      if (recording !== null) order.push(recording);
    }
    groups.get(recording)!.push({
      index,
      heading: scene.heading,
      take: scene.meta.take ?? null,
      at: scene.meta.at ?? null,
      server: scene.meta.server ?? null,
      pov: scene.meta.pov ?? null,
    });
  });

  const result: RecordingGroup[] = order.map((recording) => ({
    recording,
    scenes: groups.get(recording)!.sort((a, b) => seconds(a.at ?? undefined) - seconds(b.at ?? undefined) || a.index - b.index),
  }));
  const unrecorded = groups.get(null);
  if (unrecorded) result.push({ recording: null, scenes: unrecorded });
  return result;
}

/* -------------------------------------------------------------- voice lines */

export interface VoiceLine {
  scene: number;
  sceneNumber: string;
  heading: string;
  /** Which speech line in the whole script, from 1. */
  line: number;
  role: string;
  /** Who plays the role, when the project says. */
  player: string;
  text: string;
}

/**
 * Every line of dialogue in order, with who says it and who plays them, for recording the voices
 * separately from the picture. A line is one dialogue element; a parenthetical is not spoken.
 */
export function voiceLines(script: Script, players: Record<string, string> = {}): VoiceLine[] {
  const lookup = new Map(Object.entries(players).map(([role, player]) => [role.trim().toLocaleUpperCase(), player]));
  const rows: VoiceLine[] = [];
  let line = 0;
  for (const element of script.elements) {
    if (element.type !== 'dialogue') continue;
    const sceneIndex = script.scenes.findIndex((scene) => element.from >= scene.from && element.from < scene.to);
    const scene = script.scenes[sceneIndex];
    line += 1;
    rows.push({
      scene: sceneIndex,
      sceneNumber: scene?.sceneNumber ?? String(sceneIndex + 1),
      heading: scene?.heading ?? '',
      line,
      role: element.character,
      player: lookup.get(element.character.trim().toLocaleUpperCase()) ?? '',
      text: element.text.replace(/\s*\n\s*/g, ' ').trim(),
    });
  }
  return rows;
}

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The voice lines as CSV with a tick column to mark off once a line is recorded. */
export function voiceLinesCsv(rows: VoiceLine[]): string {
  const header = ['Rad', 'Scen', 'Rubrik', 'Roll', 'Spelare', 'Replik', 'Inspelad'];
  return [header, ...rows.map((row) => [row.line, row.sceneNumber, row.heading, row.role, row.player, row.text, ''])]
    .map((columns) => columns.map(cell).join(','))
    .join('\n');
}
