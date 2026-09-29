import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DataSync } from './dataSync';
import { LocalStore } from './local';
import type { CloudAdapter } from './types';

/** A cloud that only knows project data, in memory, and can be switched off. */
class MemoryCloud implements Pick<CloudAdapter, 'loadData' | 'saveData'> {
  data = new Map<string, unknown>();
  reachable = true;
  saves = 0;
  async loadData<T>(projectId: string, key: string): Promise<T | null> {
    if (!this.reachable) throw new TypeError('Failed to fetch');
    return (this.data.get(`${projectId}/${key}`) as T | undefined) ?? null;
  }
  async saveData(projectId: string, key: string, value: unknown): Promise<void> {
    if (!this.reachable) throw new TypeError('Failed to fetch');
    this.saves += 1;
    this.data.set(`${projectId}/${key}`, JSON.parse(JSON.stringify(value)));
  }
}

let counter = 0;
const freshStore = () => new LocalStore(`aplus-data-test-${counter++}`);
const open = (store: LocalStore, cloud: MemoryCloud | null) =>
  new DataSync<{ n: number }>('p1', 'stripboard', store, cloud as unknown as CloudAdapter | null, 0);

describe('project data on a local project', () => {
  it('stays on this computer', async () => {
    const store = freshStore();
    const sync = open(store, null);
    await sync.update({ n: 1 });
    await sync.flush();
    expect(await open(store, null).load()).toEqual({ n: 1 });
    expect((await store.getDataRow('p1', 'stripboard'))?.dirty).toBeUndefined();
  });
});

describe('project data on a cloud project', () => {
  it('reaches the cloud and is marked saved', async () => {
    const store = freshStore();
    const cloud = new MemoryCloud();
    const sync = open(store, cloud);
    await sync.load();
    await sync.update({ n: 2 });
    await sync.flush();
    expect(cloud.data.get('p1/stripboard')).toEqual({ n: 2 });
    expect((await store.getDataRow('p1', 'stripboard'))?.dirty).toBeUndefined();
  });

  it('opens with what another computer saved', async () => {
    const cloud = new MemoryCloud();
    const laptop = open(freshStore(), cloud);
    await laptop.update({ n: 3 });
    await laptop.flush();

    const phoneStore = freshStore();
    await phoneStore.putData('p1', 'stripboard', { n: 0 });
    expect(await open(phoneStore, cloud).load()).toEqual({ n: 3 });
    expect(await phoneStore.getData('p1', 'stripboard')).toEqual({ n: 3 });
  });

  it('keeps an offline edit and pushes it on the next open', async () => {
    const store = freshStore();
    const cloud = new MemoryCloud();
    cloud.data.set('p1/stripboard', { n: 1 });
    cloud.reachable = false;
    const offline = open(store, cloud);
    await offline.update({ n: 9 });
    await offline.flush();
    expect((await store.getDataRow('p1', 'stripboard'))?.dirty).toBe(true);

    cloud.reachable = true;
    const again = open(store, cloud);
    // The unsaved edit here wins over the older copy in the cloud.
    expect(await again.load()).toEqual({ n: 9 });
    await again.flush();
    expect(cloud.data.get('p1/stripboard')).toEqual({ n: 9 });
  });

  it('pushes data made before the project moved to the cloud', async () => {
    const store = freshStore();
    await store.putData('p1', 'stripboard', { n: 5 });
    const cloud = new MemoryCloud();
    const sync = open(store, cloud);
    expect(await sync.load()).toEqual({ n: 5 });
    await sync.flush();
    expect(cloud.data.get('p1/stripboard')).toEqual({ n: 5 });
  });

  it('does not mark an edit saved when a newer one came in during the save', async () => {
    const store = freshStore();
    const cloud = new MemoryCloud();
    const sync = open(store, cloud);
    await sync.update({ n: 1 });
    await store.putData('p1', 'stripboard', { n: 2 }, true);
    await sync.flush();
    expect((await store.getDataRow('p1', 'stripboard'))?.dirty).toBe(true);
  });

  it('opens from this computer when the cloud cannot be reached', async () => {
    const store = freshStore();
    await store.putData('p1', 'stripboard', { n: 4 });
    const cloud = new MemoryCloud();
    cloud.reachable = false;
    expect(await open(store, cloud).load()).toEqual({ n: 4 });
  });
});
