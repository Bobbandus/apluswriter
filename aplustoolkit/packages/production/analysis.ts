import { parse } from '../fountain/parse';
import type { Element, SceneIndexEntry, Script } from '../fountain/types';
import { paginate, type Pagination } from '../paginator/paginate';
import type { PageSize } from '../paginator/geometry';

/**
 * Numbers about a script, for the assistant and for the reports.
 *
 * All deterministic. The assistant is good at judgement — "is this scene
 * dragging?" — but it should be handed the facts, not asked to count. Every
 * function here returns plain data.
 */

export function elementsOf(script: Script, scene: SceneIndexEntry): Element[] {
  return script.elements.filter((e) => e.from >= scene.from && e.to <= scene.to);
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/* ========================================================================== */
/* Difficulty                                                                 */
/* ========================================================================== */

/**
 * What makes a scene costly or hard to shoot. Deliberately basic: keyword
 * flags, not judgement. It is a nudge to look twice, and it says *why*, so a
 * false alarm is visible as one.
 */
const FLAGS: { flag: string; weight: number; re: RegExp }[] = [
  { flag: 'rain', weight: 2, re: /\b(regn\w*|rain\w*|störtskur|storm\w*)\b/i },
  { flag: 'snow', weight: 2, re: /\b(snö\w*|snow\w*)\b/i },
  { flag: 'vehicle', weight: 2, re: /\b(bil\w*|car|cars|truck|lastbil|motorcykel|buss|jakt|chase|kör\w*|driving)\b/i },
  { flag: 'stunt', weight: 3, re: /\b(stunt|slagsmål|fight\w*|faller|hoppar från|explosion\w*|exploder\w*|krasch\w*|crash\w*)\b/i },
  { flag: 'fire', weight: 3, re: /\b(eld\w*|brand\w*|fire|brinner|burning|låga\w*)\b/i },
  { flag: 'water', weight: 2, re: /\b(simm\w*|swim\w*|drunkn\w*|dränk\w*|under vatten|underwater|båt\w*|boat)\b/i },
  { flag: 'animals', weight: 2, re: /\b(hund\w*|katt\w*|häst\w*|dog|cat|horse|fågel|bird|djur|animal)\b/i },
  { flag: 'crowd', weight: 2, re: /\b(folkmassa\w*|statister?|crowd|extras|publik\w*|hundratals)\b/i },
  { flag: 'weapons', weight: 1, re: /\b(pistol\w*|gevär|revolver\w*|vapen|gun|rifle|kniv\w*|knife)\b/i },
  { flag: 'blood', weight: 1, re: /\b(blod\w*|blood\w*|sår|wound\w*)\b/i },
  { flag: 'vfx', weight: 3, re: /\b(vfx|effekt\w*|special effect|greenscreen|digital\w*|flyger|flying)\b/i },
  { flag: 'children', weight: 1, re: /\b(barn|barnet|child\w*|kid\b|kids\b|flicka|pojke)\b/i },
];

const NIGHT = new Set(['NATT', 'NIGHT', 'KVÄLL', 'EVENING', 'SKYMNING', 'DUSK', 'MIDNATT', 'MIDNIGHT', 'NATTETID', 'NIGHTTIME']);

export interface SceneDifficulty {
  scene: number;
  heading: string;
  level: 'easy' | 'medium' | 'hard';
  score: number;
  reasons: string[];
}

export function sceneDifficulty(script: Script): SceneDifficulty[] {
  return script.scenes.map((scene, index) => {
    const text = elementsOf(script, scene).map((e) => e.text).join('\n');
    const reasons: string[] = [];
    let score = 0;

    const add = (reason: string, weight: number) => {
      reasons.push(reason);
      score += weight;
    };

    if (scene.timeOfDay && NIGHT.has(scene.timeOfDay)) add('night', 1);
    if (scene.prefix?.startsWith('EXT')) add('exterior', 1);
    if (scene.speaking.length >= 4) add(`${scene.speaking.length} speaking roles`, 1);
    for (const { flag, weight, re } of FLAGS) if (re.test(text)) add(flag, weight);
    if (words(text) > 400) add('long scene', 1);

    return {
      scene: index,
      heading: scene.heading,
      level: score >= 6 ? 'hard' : score >= 3 ? 'medium' : 'easy',
      score,
      reasons,
    };
  });
}

/* ========================================================================== */
/* Structure and pacing                                                       */
/* ========================================================================== */

export interface SceneSpan {
  scene: number;
  heading: string;
  startPage: number;
  endPage: number;
  eighths: number;
  dialogueRatio: number;
  beat: string | null;
}

export interface StructureReport {
  pages: number;
  scenes: SceneSpan[];
  /** Where the classic thresholds fall, as a page and the scene running there. */
  marks: { label: string; percent: number; page: number; scene: string | null }[];
  longestScenes: { heading: string; eighths: number }[];
  /** Runs of three or more scenes that are almost all dialogue. */
  talkyStretches: { from: string; to: string; scenes: number }[];
  beats: { beat: string; page: number; scene: string }[];
}

export function structureReport(script: Script, size: PageSize, pagination?: Pagination): StructureReport {
  const pg = pagination ?? paginate(script, { pageSize: size });
  const total = pg.pages.length;

  // Start page of each scene: the page holding its heading's first character.
  const pageOfOffset = (offset: number) => {
    let page = 1;
    for (const p of pg.pages) {
      if (p.from >= 0 && p.from <= offset) page = p.number;
      else break;
    }
    return page;
  };

  const spans: SceneSpan[] = script.scenes.map((scene, i) => {
    const els = elementsOf(script, scene);
    const dialogue = els.filter((e) => e.type === 'dialogue').reduce((n, e) => n + words(e.text), 0);
    const action = els.filter((e) => e.type === 'action').reduce((n, e) => n + words(e.text), 0);
    const eighths = pg.sceneEighths[i] ?? 0;
    const startPage = pageOfOffset(scene.from);
    return {
      scene: i,
      heading: scene.heading,
      startPage,
      endPage: Math.min(total, startPage + Math.max(0, Math.ceil(eighths / 8) - 1)),
      eighths,
      dialogueRatio: dialogue + action === 0 ? 0 : Math.round((dialogue / (dialogue + action)) * 100) / 100,
      beat: scene.meta.beat ?? null,
    };
  });

  const marks = [
    ['Act one ends (≈25%)', 25],
    ['Midpoint (≈50%)', 50],
    ['Act two ends (≈75%)', 75],
  ].map(([label, percent]) => {
    const page = Math.max(1, Math.round((total * (percent as number)) / 100));
    const span = spans.filter((s) => s.startPage <= page).pop();
    return { label: label as string, percent: percent as number, page, scene: span?.heading ?? null };
  });

  const talky: StructureReport['talkyStretches'] = [];
  let run: SceneSpan[] = [];
  const flush = () => {
    if (run.length >= 3) talky.push({ from: run[0]!.heading, to: run[run.length - 1]!.heading, scenes: run.length });
    run = [];
  };
  for (const span of spans) {
    if (span.dialogueRatio >= 0.8) run.push(span);
    else flush();
  }
  flush();

  return {
    pages: total,
    scenes: spans,
    marks,
    longestScenes: [...spans].sort((a, b) => b.eighths - a.eighths).slice(0, 5).map((s) => ({ heading: s.heading, eighths: s.eighths })),
    talkyStretches: talky,
    beats: spans.filter((s) => s.beat).map((s) => ({ beat: s.beat as string, page: s.startPage, scene: s.heading })),
  };
}

/* ========================================================================== */
/* Schedule groups                                                            */
/* ========================================================================== */

export interface ScheduleGroup {
  location: string;
  /** Scenes there, in script order. */
  scenes: { index: number; heading: string; timeOfDay: string | null; eighths: number }[];
  night: boolean;
  day: boolean;
  cast: string[];
  eighths: number;
}

/**
 * Scenes grouped by location, the way a first draft of a schedule starts:
 * everything shot in one place is shot together. The assistant then arranges
 * groups into days; this only supplies the facts to arrange.
 */
export function scheduleGroups(script: Script, size: PageSize, pagination?: Pagination): ScheduleGroup[] {
  const pg = pagination ?? paginate(script, { pageSize: size });
  const groups = new Map<string, ScheduleGroup>();

  script.scenes.forEach((scene, index) => {
    const key = scene.location.toUpperCase() || scene.heading;
    const group =
      groups.get(key) ??
      ({ location: key, scenes: [], night: false, day: false, cast: [], eighths: 0 } satisfies ScheduleGroup);
    const eighths = pg.sceneEighths[index] ?? 0;
    group.scenes.push({ index, heading: scene.heading, timeOfDay: scene.timeOfDay, eighths });
    const isNight = scene.timeOfDay ? NIGHT.has(scene.timeOfDay) : false;
    if (isNight) group.night = true;
    else group.day = true;
    for (const name of [...scene.speaking, ...(scene.meta.cast ?? []).map((n) => n.toUpperCase())]) {
      if (!group.cast.includes(name)) group.cast.push(name);
    }
    group.eighths += eighths;
    groups.set(key, group);
  });

  return [...groups.values()].sort((a, b) => b.eighths - a.eighths);
}

/* ========================================================================== */
/* One character's lines                                                      */
/* ========================================================================== */

export interface CharacterLine {
  scene: number;
  heading: string;
  text: string;
  parenthetical: string | null;
  /** The line spoken just before, and by whom — the context that gives it meaning. */
  after: { speaker: string; text: string } | null;
}

export function characterLines(script: Script, name: string): CharacterLine[] {
  const wanted = name.trim().toUpperCase();
  const out: CharacterLine[] = [];
  const els = script.elements;

  script.scenes.forEach((scene, sceneIndex) => {
    const inScene = els.filter((e) => e.from >= scene.from && e.to <= scene.to);
    inScene.forEach((el, i) => {
      if (el.type !== 'character' || el.name !== wanted) return;
      let paren: string | null = null;
      let text = '';
      for (let j = i + 1; j < inScene.length; j += 1) {
        const next = inScene[j] as Element;
        if (next.type === 'parenthetical') paren = next.text.replace(/^\(|\)$/g, '').trim();
        else if (next.type === 'dialogue') text += `${text ? ' ' : ''}${next.text.replace(/\n/g, ' ')}`;
        else break;
      }
      // The speech before this one.
      let after: CharacterLine['after'] = null;
      for (let k = i - 1; k >= 0; k -= 1) {
        const prev = inScene[k] as Element;
        if (prev.type === 'dialogue') {
          after = { speaker: prev.character, text: prev.text.replace(/\n/g, ' ') };
          break;
        }
        if (prev.type === 'sceneHeading') break;
      }
      out.push({ scene: sceneIndex, heading: scene.heading, text, parenthetical: paren, after });
    });
  });

  return out;
}

export { parse };
