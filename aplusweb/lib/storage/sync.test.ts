import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalStore } from './local';
import { DocumentSync } from './sync';
import type { CloudAdapter, ProjectMeta, SaveResult } from './types';

/**
 * The sync engine, with two "computers" talking to one cloud.
 *
 * The cloud here is in memory but enforces the same rule as save_script():
 * a save naming a stale version is refused with the current text. That rule
 * is tested against real Postgres in supabase/sql.test.ts; this file tests
 * that the client reacts to it correctly.
 */

class MemoryCloud implements CloudAdapter {
  content = '';
  version = 0;
  reachable = true;
  saves = 0;

  private check() {
    if (!this.reachable) throw new TypeError('Failed to fetch');
  }
  async listProjects(): Promise<ProjectMeta[]> {
    return [];
  }
  async createProject() {}
  async updateProject() {}
  async deleteProject() {}
  async loadScript() {
    this.check();
    return { content: this.content, version: this.version };
  }
  async saveScript(_id: string, content: string, expected: number): Promise<SaveResult> {
    this.check();
    if (expected !== this.version) return { ok: false, conflict: { content: this.content, version: this.version } };
    this.content = content;
    this.version += 1;
    this.saves += 1;
    return { ok: true, version: this.version };
  }
  async loadData() {
    return null;
  }
  async saveData() {}
}

let counter = 0;
const freshStore = () => new LocalStore(`aplus-test-${counter++}`);
const fast = { localDelay: 0, cloudDelay: 0, retryDelay: 1_000_000 };

async function open(store: LocalStore, cloud: CloudAdapter | null, location: 'local' | 'cloud', online = () => true) {
  const sync = new DocumentSync('p1', store, cloud, location, { ...fast, isOnline: online });
  const text = await sync.load();
  return { sync, text };
}

describe('a local project', () => {
  it('saves to this computer and says so', async () => {
    const store = freshStore();
    const { sync } = await open(store, null, 'local');
    sync.update('INT. KÖK - DAG');
    await sync.flush();
    expect((await store.getScript('p1'))?.content).toBe('INT. KÖK - DAG');
    expect(sync.snapshot().state).toBe('local');
  });

  it('reopens with what was written', async () => {
    const store = freshStore();
    const first = await open(store, null, 'local');
    first.sync.update('FADE IN:');
    await first.sync.flush();
    expect((await open(store, null, 'local')).text).toBe('FADE IN:');
  });
});

describe('a cloud project', () => {
  it('saves locally and then to the cloud', async () => {
    const cloud = new MemoryCloud();
    const store = freshStore();
    const { sync } = await open(store, cloud, 'cloud');
    sync.update('INT. KÖK - DAG');
    await sync.flush();

    expect(cloud.content).toBe('INT. KÖK - DAG');
    expect(cloud.version).toBe(1);
    expect(sync.snapshot().state).toBe('saved');
    expect(await store.getScript('p1')).toMatchObject({ dirty: false, baseVersion: 1 });
  });

  it('opens with the cloud text on a new computer', async () => {
    const cloud = new MemoryCloud();
    cloud.content = 'EXT. HAV - NATT';
    cloud.version = 4;
    expect((await open(freshStore(), cloud, 'cloud')).text).toBe('EXT. HAV - NATT');
  });

  /**
   * The case the whole design exists for. Two computers, one script. The
   * second one's save is refused, both texts are kept, and the writer chooses.
   */
  it('turns a save from a stale copy into a conflict instead of an overwrite', async () => {
    const cloud = new MemoryCloud();
    const laptop = await open(freshStore(), cloud, 'cloud');
    const desktop = await open(freshStore(), cloud, 'cloud');

    laptop.sync.update('laptop version');
    await laptop.sync.flush();

    desktop.sync.update('desktop version');
    await desktop.sync.flush();

    expect(cloud.content).toBe('laptop version');
    expect(desktop.sync.snapshot()).toEqual({
      state: 'conflict',
      conflict: { content: 'laptop version', version: 1 },
    });
  });

  it('resolves a conflict by taking the cloud version', async () => {
    const cloud = new MemoryCloud();
    const laptop = await open(freshStore(), cloud, 'cloud');
    const desktop = await open(freshStore(), cloud, 'cloud');
    laptop.sync.update('laptop version');
    await laptop.sync.flush();
    desktop.sync.update('desktop version');
    await desktop.sync.flush();

    expect(await desktop.sync.resolve('theirs')).toBe('laptop version');
    expect(desktop.sync.snapshot().state).toBe('saved');
    expect(cloud.content).toBe('laptop version');
  });

  it('resolves a conflict by keeping the writer’s own version, knowingly', async () => {
    const cloud = new MemoryCloud();
    const laptop = await open(freshStore(), cloud, 'cloud');
    const desktop = await open(freshStore(), cloud, 'cloud');
    laptop.sync.update('laptop version');
    await laptop.sync.flush();
    desktop.sync.update('desktop version');
    await desktop.sync.flush();

    expect(await desktop.sync.resolve('mine')).toBe('desktop version');
    expect(cloud.content).toBe('desktop version');
    expect(cloud.version).toBe(2);
    expect(desktop.sync.snapshot().state).toBe('saved');
  });

  it('pushes nothing while a conflict is open, but keeps every keystroke locally', async () => {
    const cloud = new MemoryCloud();
    const store = freshStore();
    const laptop = await open(freshStore(), cloud, 'cloud');
    const desktop = await open(store, cloud, 'cloud');
    laptop.sync.update('laptop');
    await laptop.sync.flush();
    desktop.sync.update('desktop');
    await desktop.sync.flush();
    const savesBefore = cloud.saves;

    desktop.sync.update('desktop, still typing');
    await desktop.sync.flush();

    expect(cloud.saves).toBe(savesBefore);
    expect((await store.getScript('p1'))?.content).toBe('desktop, still typing');
  });
});

describe('offline', () => {
  it('keeps working offline and syncs when the connection returns', async () => {
    const cloud = new MemoryCloud();
    const store = freshStore();
    let online = true;
    const { sync } = await open(store, cloud, 'cloud', () => online);

    online = false;
    cloud.reachable = false;
    sync.update('written on the train');
    await sync.flush();

    expect(sync.snapshot().state).toBe('offline');
    expect(await store.getScript('p1')).toMatchObject({ content: 'written on the train', dirty: true });

    online = true;
    cloud.reachable = true;
    sync.online();
    await sync.push();

    expect(cloud.content).toBe('written on the train');
    expect(sync.snapshot().state).toBe('saved');
  });

  it('opens from the local copy when the cloud cannot be reached', async () => {
    const cloud = new MemoryCloud();
    const store = freshStore();
    const first = await open(store, cloud, 'cloud');
    first.sync.update('safe locally');
    await first.sync.flush();

    cloud.reachable = false;
    const second = await open(store, cloud, 'cloud');
    expect(second.text).toBe('safe locally');
    expect(second.sync.snapshot().state).toBe('offline');
  });
});

describe('reopening with unsaved local work', () => {
  it('pushes it if nobody else saved in the meantime', async () => {
    const cloud = new MemoryCloud();
    const store = freshStore();
    let online = false;
    const first = await open(store, cloud, 'cloud', () => online);
    first.sync.update('offline edit');
    await first.sync.flush(); // stays local: offline

    online = true;
    const second = await open(store, cloud, 'cloud', () => online);
    await second.sync.push();
    expect(second.text).toBe('offline edit');
    expect(cloud.content).toBe('offline edit');
  });

  it('raises a conflict if someone else saved in the meantime', async () => {
    const cloud = new MemoryCloud();
    const store = freshStore();
    let online = false;
    const first = await open(store, cloud, 'cloud', () => online);
    first.sync.update('my offline edit');
    await first.sync.flush();

    cloud.content = 'someone else';
    cloud.version = 1;

    online = true;
    const second = await open(store, cloud, 'cloud', () => online);
    expect(second.text).toBe('my offline edit');
    expect(second.sync.snapshot().conflict).toEqual({ content: 'someone else', version: 1 });
  });
});
