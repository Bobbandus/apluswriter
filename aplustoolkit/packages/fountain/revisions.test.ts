import { describe, expect, it } from 'vitest';
import {
  REVISION_COLORS,
  createRevision,
  nextColor,
  pruneAuto,
  worthSnapshotting,
  type Revision,
} from './revisions';

const at = (day: number, hour = 12, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();

const make = (over: Partial<Revision> & Pick<Revision, 'id'>): Revision => ({
  projectId: 'p',
  kind: 'named',
  label: '',
  color: 'white',
  content: 'x',
  createdAt: 0,
  ...over,
});

describe('the colour sequence', () => {
  it('runs white, blue, pink, yellow, green, goldenrod, buff, salmon, cherry', () => {
    expect([...REVISION_COLORS]).toEqual([
      'white', 'blue', 'pink', 'yellow', 'green', 'goldenrod', 'buff', 'salmon', 'cherry',
    ]);
  });

  it('starts with white and advances one colour per named revision', () => {
    const named = (n: number) => Array.from({ length: n }, (_, i) => make({ id: String(i) }));
    expect(nextColor([])).toBe('white');
    expect(nextColor(named(1))).toBe('blue');
    expect(nextColor(named(3))).toBe('yellow');
  });

  // A production past Cherry starts round again, which is what a real one does.
  it('wraps round after cherry', () => {
    const many = Array.from({ length: 9 }, (_, i) => make({ id: String(i) }));
    expect(nextColor(many)).toBe('white');
    expect(nextColor([...many, make({ id: 'x' })])).toBe('blue');
  });

  // Ten quiet snapshots overnight must not turn the next issued draft Salmon.
  it('is not advanced by automatic snapshots', () => {
    const quiet = Array.from({ length: 10 }, (_, i) => make({ id: `a${i}`, kind: 'auto', color: null }));
    expect(nextColor(quiet)).toBe('white');
  });
});

describe('createRevision', () => {
  const base = { id: 'r1', projectId: 'p', content: 'INT. A - DAG', now: 1000 };

  it('names a draft and gives it the next colour', () => {
    const first = createRevision({ ...base, kind: 'named', label: 'Till producenten' }, []);
    expect(first).toMatchObject({ kind: 'named', label: 'Till producenten', color: 'white', createdAt: 1000 });
    const second = createRevision({ ...base, id: 'r2', kind: 'named', label: 'Andra' }, [first]);
    expect(second.color).toBe('blue');
  });

  // The colour's name is a word, and which word depends on the language.
  // That is the interface's job: the store keeps what the writer typed.
  it('keeps an unnamed draft unnamed and lets the interface say its colour', () => {
    expect(createRevision({ ...base, kind: 'named', label: '   ' }, [])).toMatchObject({ label: '', color: 'white' });
    expect(createRevision({ ...base, kind: 'named' }, [])).toMatchObject({ label: '', color: 'white' });
  });

  it('gives an automatic snapshot no name and no colour', () => {
    expect(createRevision({ ...base, kind: 'auto' }, [])).toMatchObject({ kind: 'auto', label: '', color: null });
  });

  it('keeps the whole script, byte for byte', () => {
    const text = 'INT. KÖK - DAG\n\n\nErik.   \n';
    expect(createRevision({ ...base, content: text, kind: 'named' }, []).content).toBe(text);
  });
});

describe('worthSnapshotting', () => {
  it('skips an empty script', () => {
    expect(worthSnapshotting(undefined, '')).toBe(false);
    expect(worthSnapshotting(undefined, '  \n ')).toBe(false);
  });

  it('takes the first one', () => {
    expect(worthSnapshotting(undefined, 'INT. A - DAG')).toBe(true);
  });

  it('skips a script identical to the newest revision, and takes a changed one', () => {
    expect(worthSnapshotting({ content: 'a' }, 'a')).toBe(false);
    expect(worthSnapshotting({ content: 'a' }, 'ab')).toBe(true);
  });
});

describe('pruneAuto', () => {
  const autoAt = (id: string, time: number) => make({ id, kind: 'auto', color: null, createdAt: time });

  it('keeps everything while there are few', () => {
    const few = Array.from({ length: 5 }, (_, i) => autoAt(`a${i}`, at(1, 10, i)));
    expect(pruneAuto(few)).toEqual([]);
  });

  it('keeps the newest ones in full and thins the older ones to one a day', () => {
    // Twenty-five snapshots on day 1, ten minutes apart, then twenty more on day 2.
    const dayOne = Array.from({ length: 25 }, (_, i) => autoAt(`d1-${i}`, at(1, 9, i * 2)));
    const dayTwo = Array.from({ length: 20 }, (_, i) => autoAt(`d2-${i}`, at(2, 9, i * 2)));
    const doomed = new Set(pruneAuto([...dayOne, ...dayTwo]));

    // Day two is the newest twenty: all kept.
    for (const revision of dayTwo) expect(doomed.has(revision.id)).toBe(false);
    // Day one is all "older", so only its newest survives.
    const survivors = dayOne.filter((revision) => !doomed.has(revision.id));
    expect(survivors.map((revision) => revision.id)).toEqual(['d1-24']);
  });

  it('never touches a named revision, however old', () => {
    const named = make({ id: 'keep', kind: 'named', createdAt: at(1) });
    const noise = Array.from({ length: 30 }, (_, i) => autoAt(`a${i}`, at(1, 8, i)));
    expect(pruneAuto([named, ...noise])).not.toContain('keep');
  });

  it('honours the size of the recent window', () => {
    const many = Array.from({ length: 6 }, (_, i) => autoAt(`a${i}`, at(1, 10, i)));
    // Keep the newest two in full; the other four share a day, so three go.
    expect(pruneAuto(many, { keepRecent: 2 })).toHaveLength(3);
  });
});
