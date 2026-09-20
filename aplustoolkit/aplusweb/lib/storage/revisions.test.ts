import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import type { Revision } from '@aplus/fountain/revisions';
import { LocalStore } from './local';

let n = 0;
const name = () => `aplus-revisions-${n++}`;

const revision = (over: Partial<Revision> & Pick<Revision, 'id'>): Revision => ({
  projectId: 'p1',
  kind: 'named',
  label: 'Blå',
  color: 'blue',
  content: 'INT. A - DAG',
  createdAt: 1,
  ...over,
});

describe('revisions in the local store', () => {
  it('lists a project\'s revisions newest first, and only that project\'s', async () => {
    const store = new LocalStore(name());
    await store.putRevision(revision({ id: 'old', createdAt: 100 }));
    await store.putRevision(revision({ id: 'new', createdAt: 300 }));
    await store.putRevision(revision({ id: 'mid', createdAt: 200 }));
    await store.putRevision(revision({ id: 'other', projectId: 'p2', createdAt: 999 }));

    expect((await store.listRevisions('p1')).map((r) => r.id)).toEqual(['new', 'mid', 'old']);
    expect((await store.listRevisions('p2')).map((r) => r.id)).toEqual(['other']);
  });

  it('stores the whole script and hands it back byte for byte', async () => {
    const store = new LocalStore(name());
    const text = 'INT. KÖK - DAG\n\n\nErik.   \n';
    await store.putRevision(revision({ id: 'r', content: text }));
    expect((await store.getRevision('r'))?.content).toBe(text);
  });

  it('deletes the ones it is told to and nothing else', async () => {
    const store = new LocalStore(name());
    for (const id of ['a', 'b', 'c']) await store.putRevision(revision({ id }));
    await store.deleteRevisions(['a', 'c']);
    expect((await store.listRevisions('p1')).map((r) => r.id)).toEqual(['b']);
    await store.deleteRevisions([]); // a no-op, not an error
  });

  // A revision without its project is a script nobody can find.
  it('goes when its project goes', async () => {
    const store = new LocalStore(name());
    await store.putProject({ id: 'p1', title: 'T', pageSize: 'a4', updatedAt: 1, createdAt: 1, location: 'local' });
    await store.putRevision(revision({ id: 'gone' }));
    await store.putRevision(revision({ id: 'stays', projectId: 'p2' }));

    await store.deleteProject('p1');

    expect(await store.listRevisions('p1')).toEqual([]);
    expect((await store.listRevisions('p2')).map((r) => r.id)).toEqual(['stays']);
  });
});

describe('upgrading a database that predates revisions', () => {
  // The part of a schema bump that can lose work. A writer who opens the app
  // after this update has projects in a version-1 database, and they must come
  // through it untouched.
  it('keeps every project, script and piece of data', async () => {
    const dbName = name();

    const v1 = await openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('scripts', { keyPath: 'projectId' });
        db.createObjectStore('data', { keyPath: ['projectId', 'key'] });
      },
    });
    await v1.put('projects', { id: 'p1', title: 'Min film', pageSize: 'a4', updatedAt: 5, createdAt: 1, location: 'local' });
    await v1.put('scripts', { projectId: 'p1', content: 'INT. KÖK - DAG\n\nErik.', baseVersion: 0, dirty: false, updatedAt: 5 });
    await v1.put('data', { projectId: 'p1', key: 'styleGuide', value: 'Torr komedi.', updatedAt: 5 });
    v1.close();

    const store = new LocalStore(dbName); // opens at version 2 and upgrades

    expect((await store.getProject('p1'))?.title).toBe('Min film');
    expect((await store.getScript('p1'))?.content).toBe('INT. KÖK - DAG\n\nErik.');
    expect(await store.getData('p1', 'styleGuide')).toBe('Torr komedi.');
    // ...and the new store is there and works.
    await store.putRevision(revision({ id: 'first' }));
    expect((await store.listRevisions('p1')).map((r) => r.id)).toEqual(['first']);
  });
});
