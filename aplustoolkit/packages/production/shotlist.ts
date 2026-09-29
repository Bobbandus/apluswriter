import type { Shot, ShotSize, Shotlist } from '../bridge/protocol';
import type { SceneIndexEntry, Script } from '../fountain/types';
import { resolveRefs, type StripRef } from './stripboard';

/**
 * Shotlists as a production plans them: one per scene, a numbered list of
 * shots. The same `Shotlist` shape Claude sends as a suggestion card, so a
 * list Claude drafted and a list typed by hand are one and the same thing,
 * edited in one place.
 *
 * Pure functions over plain data; the page stores the result.
 */

/** Every standard size, widest first — the order a scene is usually covered in. */
export const SHOT_SIZES: readonly ShotSize[] = ['EWS', 'WS', 'MWS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'TWO', 'POV', 'INSERT'];

/* ========================================================================== */
/* Reading stored data                                                        */
/* ========================================================================== */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

function readShot(value: unknown, position: number): Shot | null {
  if (!isRecord(value)) return null;
  const shot: Shot = {
    number: str(value['number']) ?? (typeof value['number'] === 'number' ? String(value['number']) : String(position + 1)),
    size: str(value['size']) ?? '',
    description: str(value['description']) ?? '',
  };
  for (const key of ['angle', 'movement', 'notes', 'camera', 'follow', 'path', 'speed'] as const) {
    const v = str(value[key]);
    if (v) shot[key] = v;
  }
  if (typeof value['lens'] === 'number' && Number.isFinite(value['lens']) && value['lens'] > 0) shot.lens = value['lens'];
  if (Array.isArray(value['subjects'])) {
    const subjects = value['subjects'].filter((s): s is string => typeof s === 'string' && s.trim() !== '');
    if (subjects.length) shot.subjects = subjects;
  }
  return shot;
}

/** Shotlists from whatever was stored, dropping only what cannot be a shotlist at all. */
export function readShotlists(value: unknown): Shotlist[] {
  if (!Array.isArray(value)) return [];
  const out: Shotlist[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || !isRecord(raw['scene'])) continue;
    const { index, heading } = raw['scene'];
    if (typeof index !== 'number' || typeof heading !== 'string') continue;
    const list: Shotlist = {
      scene: { index, heading },
      shots: Array.isArray(raw['shots']) ? raw['shots'].map(readShot).filter((s): s is Shot => s !== null) : [],
    };
    const sceneId = str(raw['sceneId']);
    if (sceneId) list.sceneId = sceneId;
    const approach = str(raw['approach']);
    if (approach) list.approach = approach;
    out.push(list);
  }
  return out;
}

/* ========================================================================== */
/* Which scene each list belongs to                                           */
/* ========================================================================== */

const refFor = (list: Shotlist): StripRef => {
  const ref: StripRef = { index: list.scene.index, heading: list.scene.heading };
  if (list.sceneId) ref.sceneId = list.sceneId;
  return ref;
};

/**
 * For each shotlist, the scene it belongs to today, or null when its scene
 * is gone (deleted, or the heading rewritten on a scene with no `[[id:]]`).
 * No scene gets two lists: the nearer one wins, the other shows as detached.
 */
export function resolveShotlists(scenes: readonly SceneIndexEntry[], lists: readonly Shotlist[]): (number | null)[] {
  return resolveRefs(scenes, lists.map(refFor));
}

/** A list re-pointed at a scene, with that scene's id when it has a real one. */
export function attachTo(list: Shotlist, scenes: readonly SceneIndexEntry[], index: number): Shotlist {
  const scene = scenes[index];
  if (!scene) return list;
  const next: Shotlist = { ...list, scene: { index, heading: scene.heading } };
  if (scene.id && !scene.id.startsWith('#')) next.sceneId = scene.id;
  else delete next.sceneId;
  return next;
}

/**
 * Lists brought up to date with the script (position, heading spacing, a
 * newly added `[[id:]]`), so drift never adds up to a detached list. The same
 * array comes back when nothing changed, so callers can skip the write.
 */
export function refreshShotlists(scenes: readonly SceneIndexEntry[], lists: readonly Shotlist[]): readonly Shotlist[] {
  const found = resolveShotlists(scenes, lists);
  let changed = false;
  const next = lists.map((list, i) => {
    const index = found[i];
    if (index === null || index === undefined) return list;
    const scene = scenes[index] as SceneIndexEntry;
    const id = scene.id && !scene.id.startsWith('#') ? scene.id : undefined;
    if (list.scene.index === index && list.scene.heading === scene.heading && (id === undefined || list.sceneId === id)) return list;
    changed = true;
    return attachTo(list, scenes, index);
  });
  return changed ? next : lists;
}

/* ========================================================================== */
/* Shots                                                                      */
/* ========================================================================== */

/** The number after the highest one in use: after 1, 2, 2A comes 3. */
export function nextShotNumber(shots: readonly Shot[]): string {
  let highest = 0;
  for (const shot of shots) {
    const match = /^\s*(\d+)/.exec(shot.number);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return String(highest + 1);
}

export function newShot(shots: readonly Shot[], size: string = shots.length === 0 ? 'WS' : 'MS'): Shot {
  return { number: nextShotNumber(shots), size, description: '' };
}

/** 1, 2, 3 … in the order the shots are listed. */
export function renumber(shots: readonly Shot[]): Shot[] {
  return shots.map((shot, i) => (shot.number === String(i + 1) ? shot : { ...shot, number: String(i + 1) }));
}

export function moveShot(shots: readonly Shot[], from: number, to: number): Shot[] {
  if (from < 0 || from >= shots.length) return [...shots];
  const target = Math.min(shots.length - 1, Math.max(0, to));
  const next = [...shots];
  const [shot] = next.splice(from, 1);
  next.splice(target, 0, shot as Shot);
  return next;
}

/** Lens, angle, movement and the game-camera fields, as one short line. */
export function shotSpecs(shot: Shot): string {
  return [
    shot.lens ? `${shot.lens} mm` : null,
    shot.angle,
    shot.movement,
    shot.camera,
    shot.follow ? `→ ${shot.follow}` : null,
    shot.path,
    shot.speed,
  ]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(' · ');
}

/** An empty shot left behind by "add" and never filled in. */
export const isBlankShot = (shot: Shot) =>
  !shot.description.trim() && !shot.angle && !shot.movement && !shot.lens && !shot.notes && !shot.subjects?.length;

/* ========================================================================== */
/* Export                                                                     */
/* ========================================================================== */

const BOM = '﻿';
const field = (value: string | number) => {
  const text = String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Every shot of every scene, in script order, for Excel. Lists whose scene is
 * gone come last, under their old heading, rather than being left out.
 */
export function shotlistCsv(script: Pick<Script, 'scenes'>, lists: readonly Shotlist[]): string {
  const found = resolveShotlists(script.scenes, lists);
  const order = lists
    .map((list, i) => ({ list, scene: found[i] ?? null }))
    .sort((a, b) => (a.scene ?? Number.MAX_SAFE_INTEGER) - (b.scene ?? Number.MAX_SAFE_INTEGER));

  const rows: (string | number)[][] = [['Scen', 'Rubrik', 'Bild', 'Storlek', 'Vinkel', 'Rörelse', 'Objektiv', 'I bild', 'Beskrivning', 'Anteckning']];
  for (const { list, scene } of order) {
    const entry = scene === null ? null : script.scenes[scene];
    for (const shot of list.shots) {
      rows.push([
        entry ? (entry.sceneNumber ?? (scene as number) + 1) : '',
        entry?.heading ?? list.scene.heading,
        shot.number,
        shot.size,
        shot.angle ?? '',
        shot.movement ?? '',
        shot.lens ? `${shot.lens} mm` : '',
        (shot.subjects ?? []).join(', '),
        shot.description,
        shot.notes ?? '',
      ]);
    }
  }
  return `${BOM}${rows.map((r) => r.map(field).join(';')).join('\r\n')}\r\n`;
}
