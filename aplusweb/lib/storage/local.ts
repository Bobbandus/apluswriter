import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LocalScript, ProjectMeta } from './types';

/**
 * The local store: IndexedDB.
 *
 * IndexedDB rather than localStorage for three reasons that each matter on
 * their own: it is not capped at ~5 MB (a writer with thirty features would
 * hit that), writes do not block the main thread, and it is transactional —
 * a script and its metadata are written together or not at all.
 */

interface AplusDB extends DBSchema {
  projects: { key: string; value: ProjectMeta };
  scripts: { key: string; value: LocalScript };
  data: { key: [string, string]; value: { projectId: string; key: string; value: unknown; updatedAt: number } };
}

const DB_NAME = 'aplus-write';
const DB_VERSION = 1;

export class LocalStore {
  private dbPromise: Promise<IDBPDatabase<AplusDB>> | null = null;

  constructor(private readonly name = DB_NAME) {}

  private db(): Promise<IDBPDatabase<AplusDB>> {
    this.dbPromise ??= openDB<AplusDB>(this.name, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('scripts')) db.createObjectStore('scripts', { keyPath: 'projectId' });
        if (!db.objectStoreNames.contains('data')) db.createObjectStore('data', { keyPath: ['projectId', 'key'] });
      },
    });
    return this.dbPromise;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const all = await (await this.db()).getAll('projects');
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getProject(id: string): Promise<ProjectMeta | undefined> {
    return (await this.db()).get('projects', id);
  }

  async putProject(meta: ProjectMeta): Promise<void> {
    await (await this.db()).put('projects', meta);
  }

  async patchProject(id: string, patch: Partial<ProjectMeta>): Promise<ProjectMeta | undefined> {
    const db = await this.db();
    const tx = db.transaction('projects', 'readwrite');
    const current = await tx.store.get(id);
    if (!current) {
      await tx.done;
      return undefined;
    }
    const next = { ...current, ...patch };
    await tx.store.put(next);
    await tx.done;
    return next;
  }

  /** Removes the project, its script and its data in one transaction. */
  async deleteProject(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['projects', 'scripts', 'data'], 'readwrite');
    await tx.objectStore('projects').delete(id);
    await tx.objectStore('scripts').delete(id);
    const data = tx.objectStore('data');
    for (const key of await data.getAllKeys()) {
      if (key[0] === id) await data.delete(key);
    }
    await tx.done;
  }

  async getScript(projectId: string): Promise<LocalScript | undefined> {
    return (await this.db()).get('scripts', projectId);
  }

  /**
   * Writes the script and bumps the project's `updatedAt` together, so the
   * dashboard can never show a project as untouched after it was edited.
   */
  async putScript(script: LocalScript, projectPatch: Partial<ProjectMeta> = {}): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['scripts', 'projects'], 'readwrite');
    await tx.objectStore('scripts').put(script);
    const meta = await tx.objectStore('projects').get(script.projectId);
    if (meta) await tx.objectStore('projects').put({ ...meta, ...projectPatch, updatedAt: script.updatedAt });
    await tx.done;
  }

  async getData<T>(projectId: string, key: string): Promise<T | null> {
    const row = await (await this.db()).get('data', [projectId, key]);
    return (row?.value as T | undefined) ?? null;
  }

  async putData(projectId: string, key: string, value: unknown): Promise<void> {
    await (await this.db()).put('data', { projectId, key, value, updatedAt: Date.now() });
  }
}

let shared: LocalStore | null = null;

/** The app-wide local store. */
export function localStore(): LocalStore {
  shared ??= new LocalStore();
  return shared;
}
