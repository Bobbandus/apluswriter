'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PageSize } from '@aplus/paginator/geometry';
import type { CloudAdapter, ProjectMeta, SaveResult } from './types';

/**
 * The Supabase side of storage.
 *
 * Script writes go through the `save_script` function, never a table update:
 * the function is where the version check lives, and RLS gives clients no
 * write access to `scripts` at all. That makes "overwrote someone's work"
 * impossible to reach by accident from here, rather than merely unlikely.
 */

interface ProjectRow {
  id: string;
  title: string;
  page_size: PageSize;
  created_at: string;
  updated_at: string;
}

const toMeta = (row: ProjectRow): ProjectMeta => ({
  id: row.id,
  title: row.title,
  pageSize: row.page_size,
  createdAt: Date.parse(row.created_at),
  updatedAt: Date.parse(row.updated_at),
  location: 'cloud',
});

export class SupabaseAdapter implements CloudAdapter {
  /** project id → script id, so a save does not need a lookup each time. */
  private readonly scriptIds = new Map<string, string>();

  constructor(private readonly db: SupabaseClient) {}

  private async userId(): Promise<string> {
    const { data } = await this.db.auth.getUser();
    if (!data.user) throw new Error('Not signed in');
    return data.user.id;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const { data, error } = await this.db
      .from('projects')
      .select('id, title, page_size, created_at, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data as ProjectRow[]).map(toMeta);
  }

  async createProject(input: { id: string; title: string; pageSize: PageSize }): Promise<void> {
    const { error } = await this.db
      .from('projects')
      .insert({ id: input.id, owner_id: await this.userId(), title: input.title, page_size: input.pageSize });
    if (error) throw error;
  }

  async updateProject(id: string, patch: { title?: string; pageSize?: PageSize }): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row['title'] = patch.title;
    if (patch.pageSize !== undefined) row['page_size'] = patch.pageSize;
    const { error } = await this.db.from('projects').update(row).eq('id', id);
    if (error) throw error;
  }

  /** Soft delete: a project deleted by mistake can still be restored. */
  async deleteProject(id: string): Promise<void> {
    const { error } = await this.db.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async loadScript(projectId: string): Promise<{ content: string; version: number } | null> {
    const { data, error } = await this.db
      .from('scripts')
      .select('id, content, version')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    this.scriptIds.set(projectId, data.id as string);
    return { content: data.content as string, version: data.version as number };
  }

  async saveScript(projectId: string, content: string, expectedVersion: number): Promise<SaveResult> {
    let scriptId = this.scriptIds.get(projectId);
    if (!scriptId) {
      await this.loadScript(projectId);
      scriptId = this.scriptIds.get(projectId);
    }
    if (!scriptId) throw new Error('Script not found');

    const { data, error } = await this.db.rpc('save_script', {
      p_script_id: scriptId,
      p_content: content,
      p_expected_version: expectedVersion,
    });

    if (error) {
      // P0409 is save_script saying "someone saved first". Fetch what they
      // saved so the writer can see both versions.
      if (error.code === 'P0409') {
        const current = await this.loadScript(projectId);
        if (current) return { ok: false, conflict: current };
      }
      throw error;
    }

    const row = (Array.isArray(data) ? data[0] : data) as { version: number } | undefined;
    return { ok: true, version: row?.version ?? expectedVersion + 1 };
  }

  async loadData<T>(projectId: string, key: string): Promise<T | null> {
    const { data, error } = await this.db
      .from('project_data')
      .select('value')
      .eq('project_id', projectId)
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    return (data?.value as T | undefined) ?? null;
  }

  async saveData(projectId: string, key: string, value: unknown): Promise<void> {
    const { error } = await this.db.from('project_data').upsert({ project_id: projectId, key, value });
    if (error) throw error;
  }
}
