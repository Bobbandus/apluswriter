import { parse } from '@aplus/fountain/parse';
import type { PageSize } from '@aplus/paginator/geometry';
import type { LocalStore } from './local';
import type { CloudAdapter, ProjectLocation, ProjectMeta } from './types';

/**
 * Projects, wherever they live.
 *
 * Every project has a row in the local store, cloud ones included — that row
 * is what the dashboard lists and what opens instantly, before any network.
 * The cloud list is merged in when the writer is signed in, so a project
 * started on another computer shows up here too.
 */

const LEGACY_PROJECTS = 'aplus.projects';
const LEGACY_DRAFT = 'aplus.draft.';
const MIGRATED_FLAG = 'aplus.migrated.v1';

/** A title from the script's own title page, if it has one. */
export function titleFromSource(source: string): string | null {
  const title = parse(source).titlePage?.fields.find((f) => f.key === 'title' || f.key === 'titel');
  const value = title?.values.join(' ').replace(/[*_]/g, '').trim();
  return value || null;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export class ProjectRepository {
  constructor(
    private readonly local: LocalStore,
    private readonly cloud: CloudAdapter | null,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'> | null = typeof localStorage ===
    'undefined'
      ? null
      : localStorage,
  ) {}

  /**
   * Brings projects from the old localStorage format into IndexedDB, once.
   *
   * The old keys are left in place. If anything about the migration is ever
   * wrong, the original text is still there to recover by hand; deleting a
   * writer's only copy to tidy up storage is not a trade worth making.
   */
  async migrateLegacy(untitled: string): Promise<number> {
    const store = this.storage;
    if (!store || store.getItem(MIGRATED_FLAG)) return 0;

    let listed: { id: string; title?: string; updatedAt?: number }[] = [];
    try {
      listed = JSON.parse(store.getItem(LEGACY_PROJECTS) ?? '[]') as typeof listed;
    } catch {
      listed = [];
    }

    // Drafts that exist without a project entry (the early `scratch` one).
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key?.startsWith(LEGACY_DRAFT)) continue;
      const id = key.slice(LEGACY_DRAFT.length);
      if (!listed.some((p) => p.id === id)) listed.push({ id });
    }

    let moved = 0;
    for (const entry of listed) {
      if (await this.local.getProject(entry.id)) continue;

      let content = '';
      try {
        content = JSON.parse(store.getItem(`${LEGACY_DRAFT}${entry.id}`) ?? '""') as string;
      } catch {
        content = '';
      }
      // An empty scratch pad is not worth a card on the dashboard.
      if (!content.trim() && entry.id === 'scratch') continue;

      const updatedAt = entry.updatedAt ?? Date.now();
      await this.local.putProject({
        id: entry.id,
        title: titleFromSource(content) ?? entry.title ?? untitled,
        pageSize: 'a4',
        createdAt: updatedAt,
        updatedAt,
        location: 'local',
      });
      await this.local.putScript({ projectId: entry.id, content, baseVersion: 0, dirty: false, updatedAt });
      moved += 1;
    }

    store.setItem(MIGRATED_FLAG, String(Date.now()));
    return moved;
  }

  /** All projects, newest first, with the cloud list merged in if signed in. */
  async list(): Promise<ProjectMeta[]> {
    if (this.cloud) {
      try {
        for (const remote of await this.cloud.listProjects()) {
          const known = await this.local.getProject(remote.id);
          if (!known) {
            await this.local.putProject(remote);
          } else if (remote.updatedAt > known.updatedAt || known.title !== remote.title) {
            await this.local.putProject({ ...known, title: remote.title, pageSize: remote.pageSize, updatedAt: Math.max(known.updatedAt, remote.updatedAt), location: 'cloud' });
          }
        }
      } catch {
        // Offline or signed out mid-way: the local list is still complete
        // for everything this computer has touched.
      }
    }
    return this.local.listProjects();
  }

  async get(id: string): Promise<ProjectMeta | undefined> {
    return this.local.getProject(id);
  }

  /** Creates a project. In the cloud if signed in and asked; otherwise here. */
  async create(input: { title: string; pageSize?: PageSize; content?: string; location?: ProjectLocation }): Promise<ProjectMeta> {
    const now = Date.now();
    const location: ProjectLocation = input.location === 'cloud' && this.cloud ? 'cloud' : 'local';
    const meta: ProjectMeta = {
      id: newId(),
      title: input.title,
      pageSize: input.pageSize ?? 'a4',
      createdAt: now,
      updatedAt: now,
      location,
    };
    const content = input.content ?? '';

    if (location === 'cloud' && this.cloud) {
      await this.cloud.createProject({ id: meta.id, title: meta.title, pageSize: meta.pageSize });
      let baseVersion = 0;
      if (content) {
        const saved = await this.cloud.saveScript(meta.id, content, 0);
        if (saved.ok) baseVersion = saved.version;
      }
      await this.local.putProject(meta);
      await this.local.putScript({ projectId: meta.id, content, baseVersion, dirty: false, updatedAt: now });
      return meta;
    }

    await this.local.putProject(meta);
    await this.local.putScript({ projectId: meta.id, content, baseVersion: 0, dirty: false, updatedAt: now });
    return meta;
  }

  /** Makes sure a project id opened by URL exists, as a local project. */
  async ensure(id: string, untitled: string): Promise<ProjectMeta> {
    const known = await this.local.getProject(id);
    if (known) return known;
    const now = Date.now();
    const meta: ProjectMeta = { id, title: untitled, pageSize: 'a4', createdAt: now, updatedAt: now, location: 'local' };
    await this.local.putProject(meta);
    return meta;
  }

  async rename(id: string, title: string): Promise<void> {
    const meta = await this.local.patchProject(id, { title, updatedAt: Date.now() });
    if (meta?.location === 'cloud' && this.cloud) await this.cloud.updateProject(id, { title });
  }

  async setPageSize(id: string, pageSize: PageSize): Promise<void> {
    const meta = await this.local.patchProject(id, { pageSize });
    if (meta?.location === 'cloud' && this.cloud) await this.cloud.updateProject(id, { pageSize });
  }

  /** Records the counts the dashboard shows, from the latest parse. */
  async recordStats(id: string, stats: { pages?: number; scenes?: number }): Promise<void> {
    await this.local.patchProject(id, stats);
  }

  async remove(id: string): Promise<void> {
    const meta = await this.local.getProject(id);
    if (meta?.location === 'cloud' && this.cloud) await this.cloud.deleteProject(id);
    await this.local.deleteProject(id);
  }

  async duplicate(id: string, suffix: string): Promise<ProjectMeta> {
    const meta = await this.local.getProject(id);
    const script = await this.local.getScript(id);
    return this.create({
      title: `${meta?.title ?? ''} ${suffix}`.trim(),
      pageSize: meta?.pageSize ?? 'a4',
      content: script?.content ?? '',
      location: meta?.location ?? 'local',
    });
  }

  /**
   * Moves a local project to the cloud, keeping its id so its URL still works.
   * The local copy stays as the write-ahead cache.
   */
  async moveToCloud(id: string): Promise<void> {
    if (!this.cloud) throw new Error('Not signed in');
    const meta = await this.local.getProject(id);
    if (!meta || meta.location === 'cloud') return;
    const script = await this.local.getScript(id);

    await this.cloud.createProject({ id, title: meta.title, pageSize: meta.pageSize });
    const content = script?.content ?? '';
    const saved = await this.cloud.saveScript(id, content, 0);
    const baseVersion = saved.ok ? saved.version : 0;

    await this.local.putScript({ projectId: id, content, baseVersion, dirty: false, updatedAt: Date.now() });
    await this.local.patchProject(id, { location: 'cloud' });
  }

  /**
   * Moves every project still `local` to the account just signed into.
   *
   * Nothing before this call ever crossed that line on its own — a project
   * made before signing in has no owner to send it to, so it waits here,
   * unmoved, until the writer says which account it belongs to. Returns how
   * many moved, so the caller can say so.
   */
  async moveAllToCloud(): Promise<number> {
    if (!this.cloud) throw new Error('Not signed in');
    const local = (await this.local.listProjects()).filter((p) => p.location === 'local');
    for (const project of local) await this.moveToCloud(project.id);
    return local.length;
  }

  /** A `.fountain` or `.txt` file becomes a new project. */
  async importFountain(fileName: string, text: string, location: ProjectLocation): Promise<ProjectMeta> {
    const title = titleFromSource(text) ?? fileName.replace(/\.(fountain|spmd|txt|fdx|highland|docx)$/i, '');
    return this.create({ title, content: text.replace(/\r\n/g, '\n'), location });
  }
}
