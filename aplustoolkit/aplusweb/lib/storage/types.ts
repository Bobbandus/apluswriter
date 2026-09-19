import type { PageSize } from '@aplus/paginator/geometry';

/**
 * Storage, as the rest of the app sees it.
 *
 * Every feature talks to these interfaces and never to IndexedDB, Supabase or
 * the file system directly. That is what lets the desktop build drop in a
 * file-system adapter, and what lets a project move from "on this computer"
 * to "in the cloud" without any editor code knowing.
 */

export type ProjectLocation = 'local' | 'cloud';

export interface ProjectMeta {
  id: string;
  title: string;
  pageSize: PageSize;
  /** Epoch milliseconds. */
  updatedAt: number;
  createdAt: number;
  location: ProjectLocation;
  /** Filled in from the last parse, so the dashboard can show them cheaply. */
  pages?: number;
  scenes?: number;
}

/** A save either lands, or is refused because someone else saved first. */
export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; conflict: { content: string; version: number } };

/** The remote side of a project: Supabase today. */
export interface CloudAdapter {
  listProjects(): Promise<ProjectMeta[]>;
  createProject(input: { id: string; title: string; pageSize: PageSize }): Promise<void>;
  updateProject(id: string, patch: { title?: string; pageSize?: PageSize }): Promise<void>;
  deleteProject(id: string): Promise<void>;
  loadScript(projectId: string): Promise<{ content: string; version: number } | null>;
  /** Optimistic concurrency: refused if `expectedVersion` is stale. */
  saveScript(projectId: string, content: string, expectedVersion: number): Promise<SaveResult>;
  loadData<T>(projectId: string, key: string): Promise<T | null>;
  saveData(projectId: string, key: string, value: unknown): Promise<void>;
}

/**
 * The local copy of a script.
 *
 * For a cloud project this is the write-ahead cache: every keystroke lands
 * here first, so a crash, a closed laptop or a dropped connection can never
 * cost more than the last fraction of a second.
 */
export interface LocalScript {
  projectId: string;
  content: string;
  /** The cloud version this copy was last in step with. 0 for local-only. */
  baseVersion: number;
  /** Edited locally since the last successful cloud save. */
  dirty: boolean;
  updatedAt: number;
}

/**
 * Every state the writer's work can be in. There is no "unknown" — if the app
 * cannot say where the text is, that is a bug, not a state.
 */
export type SaveState =
  | 'saving' // a local write is pending
  | 'local' // safe on this computer; the project does not sync
  | 'syncing' // pushing to the cloud
  | 'saved' // safe in the cloud
  | 'offline' // safe on this computer; will sync when back online
  | 'conflict' // changed in two places; waiting for the writer to choose
  | 'error'; // a save failed and needs attention
