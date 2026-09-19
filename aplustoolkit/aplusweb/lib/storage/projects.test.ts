import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalStore } from './local';
import { ProjectRepository } from './projects';
import type { CloudAdapter, ProjectMeta, SaveResult } from './types';

let n = 0;
const store = () => new LocalStore(`aplus-projects-${n++}`);

/** A tiny localStorage stand-in. */
function memoryStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    map,
  };
}

class Cloud implements CloudAdapter {
  projects = new Map<string, ProjectMeta>();
  scripts = new Map<string, { content: string; version: number }>();
  async listProjects() {
    return [...this.projects.values()];
  }
  async createProject(input: { id: string; title: string; pageSize: 'a4' | 'letter' }) {
    this.projects.set(input.id, { ...input, createdAt: 1, updatedAt: 1, location: 'cloud' });
    this.scripts.set(input.id, { content: '', version: 0 });
  }
  async updateProject() {}
  async deleteProject(id: string) {
    this.projects.delete(id);
  }
  async loadScript(id: string) {
    return this.scripts.get(id) ?? null;
  }
  async saveScript(id: string, content: string, expected: number): Promise<SaveResult> {
    const s = this.scripts.get(id) ?? { content: '', version: 0 };
    if (s.version !== expected) return { ok: false, conflict: s };
    this.scripts.set(id, { content, version: s.version + 1 });
    return { ok: true, version: s.version + 1 };
  }
  async loadData() {
    return null;
  }
  async saveData() {}
}

describe('migrating the old localStorage projects', () => {
  it('brings every project and its text across, and leaves the originals in place', async () => {
    const local = store();
    const legacy = memoryStorage({
      'aplus.projects': JSON.stringify([{ id: 'a', title: 'Untitled', updatedAt: 5 }]),
      'aplus.draft.a': JSON.stringify('Title: Jonathan II\n\nINT. KÖK - DAG'),
      'aplus.draft.scratch': JSON.stringify('EXT. HAV - NATT'),
    });
    const repo = new ProjectRepository(local, null, legacy);

    expect(await repo.migrateLegacy('Namnlös')).toBe(2);

    const titles = (await repo.list()).map((p) => p.title).sort();
    // The title page wins over the generic "Untitled" the old list stored.
    expect(titles).toEqual(['Jonathan II', 'Namnlös']);
    expect((await local.getScript('scratch'))?.content).toBe('EXT. HAV - NATT');
    expect(legacy.map.has('aplus.draft.a')).toBe(true);
  });

  it('runs once', async () => {
    const legacy = memoryStorage({ 'aplus.draft.x': JSON.stringify('Text') });
    const repo = new ProjectRepository(store(), null, legacy);
    expect(await repo.migrateLegacy('Namnlös')).toBe(1);
    expect(await repo.migrateLegacy('Namnlös')).toBe(0);
  });

  it('skips an empty scratch pad', async () => {
    const repo = new ProjectRepository(store(), null, memoryStorage({ 'aplus.draft.scratch': JSON.stringify('') }));
    expect(await repo.migrateLegacy('Namnlös')).toBe(0);
  });
});

describe('projects', () => {
  it('creates a local project when not signed in, even if cloud was asked for', async () => {
    const repo = new ProjectRepository(store(), null, null);
    const meta = await repo.create({ title: 'Test', location: 'cloud' });
    expect(meta.location).toBe('local');
  });

  it('creates a cloud project with its text when signed in', async () => {
    const cloud = new Cloud();
    const repo = new ProjectRepository(store(), cloud, null);
    const meta = await repo.create({ title: 'Moln', content: 'FADE IN:', location: 'cloud' });
    expect(cloud.scripts.get(meta.id)).toEqual({ content: 'FADE IN:', version: 1 });
  });

  it('moves a local project to the cloud, keeping its id', async () => {
    const cloud = new Cloud();
    const local = store();
    const offline = new ProjectRepository(local, null, null);
    const meta = await offline.create({ title: 'Flytta', content: 'INT. BIL - NATT' });

    await new ProjectRepository(local, cloud, null).moveToCloud(meta.id);

    expect(cloud.scripts.get(meta.id)).toEqual({ content: 'INT. BIL - NATT', version: 1 });
    expect((await local.getProject(meta.id))?.location).toBe('cloud');
    expect(await local.getScript(meta.id)).toMatchObject({ baseVersion: 1, dirty: false });
  });

  it('lists a project started on another computer', async () => {
    const cloud = new Cloud();
    await cloud.createProject({ id: 'remote', title: 'Från laptopen', pageSize: 'a4' });
    const repo = new ProjectRepository(store(), cloud, null);
    expect((await repo.list()).map((p) => p.title)).toEqual(['Från laptopen']);
  });

  it('imports a Fountain file, titled from its title page', async () => {
    const repo = new ProjectRepository(store(), null, null);
    const meta = await repo.importFountain('draft3.fountain', 'Title: Nån Väckte Tigern\r\n\r\nINT. BUTIK - DAG', 'local');
    expect(meta.title).toBe('Nån Väckte Tigern');
  });
});
