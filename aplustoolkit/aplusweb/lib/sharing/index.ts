'use client';

import { getSupabase } from '@/lib/supabase/client';
import type { PageSize } from '@aplus/paginator/geometry';

/**
 * Sharing a project two ways.
 *
 * **A collaborator** is a named account with a role, added by
 * `invite_project_member` (06_collaboration.sql). They see the project in
 * their own dashboard, under their own login, and an editor role lets them
 * write. Requires the address to already have an A+ Toolkit account —
 * signups are invite-only, so this never creates one.
 *
 * **A share link** is anonymous: anyone who has the token can open the
 * script read-only (or read + comment), no account needed. It is
 * `get_shared_script` and the `share_links` table, both already in
 * 03_functions.sql / 01_schema.sql — this module is only the client side of
 * something the database already did.
 *
 * Both need Supabase; every function throws when it is not configured, same
 * as the rest of `lib/storage`.
 */

export type ProjectRole = 'viewer' | 'commenter' | 'editor' | 'owner';
export type SharePermission = 'view' | 'comment';

export interface Member {
  userId: string;
  role: ProjectRole;
  /** From the shared profile columns; null for an account with no name set. */
  name: string | null;
}

export interface ShareLink {
  token: string;
  permission: SharePermission;
  createdAt: number;
  expiresAt: number | null;
}

export interface SharedScript {
  projectId: string;
  title: string;
  pageSize: PageSize;
  content: string;
  version: number;
  permission: SharePermission;
}

function db() {
  const client = getSupabase();
  if (!client) throw new Error('Not signed in');
  return client;
}

function memberName(profile: { first_name?: string | null; last_name?: string | null; display_name?: string | null } | undefined): string | null {
  if (!profile) return null;
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return full || profile.display_name || null;
}

/** Everyone on a project, owner included — names filled in from profiles. */
export async function listMembers(projectId: string): Promise<Member[]> {
  const client = db();
  const { data: members, error } = await client
    .from('project_members')
    .select('user_id, role')
    .eq('project_id', projectId);
  if (error) throw error;
  const rows = (members ?? []) as { user_id: string; role: ProjectRole }[];
  if (rows.length === 0) return [];

  const { data: profiles, error: profileError } = await client
    .from('profiles')
    .select('id, first_name, last_name, display_name')
    .in(
      'id',
      rows.map((r) => r.user_id),
    );
  if (profileError) throw profileError;
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return rows.map((r) => ({ userId: r.user_id, role: r.role, name: memberName(byId.get(r.user_id)) }));
}

/**
 * Adds (or re-invites, changing the role) a collaborator by email.
 * Rejects with a Postgres error whose `.message` the caller can show as-is —
 * "no A+ Toolkit account for that address yet" is written to be read.
 */
export async function inviteMember(projectId: string, email: string, role: Exclude<ProjectRole, 'owner'>): Promise<void> {
  const { error } = await db().rpc('invite_project_member', { p_project_id: projectId, p_email: email, p_role: role });
  if (error) throw error;
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  const { error } = await db().rpc('remove_project_member', { p_project_id: projectId, p_user_id: userId });
  if (error) throw error;
}

export async function listShareLinks(projectId: string): Promise<ShareLink[]> {
  const { data, error } = await db()
    .from('share_links')
    .select('token, permission, created_at, expires_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    token: row.token as string,
    permission: row.permission as SharePermission,
    createdAt: Date.parse(row.created_at as string),
    expiresAt: row.expires_at ? Date.parse(row.expires_at as string) : null,
  }));
}

/** `expiresAt` is an epoch time, or null/omitted for a link that never expires. */
export async function createShareLink(projectId: string, permission: SharePermission, expiresAt?: number | null): Promise<ShareLink> {
  const { data, error } = await db()
    .from('share_links')
    .insert({
      project_id: projectId,
      permission,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    .select('token, permission, created_at, expires_at')
    .single();
  if (error) throw error;
  return {
    token: data.token as string,
    permission: data.permission as SharePermission,
    createdAt: Date.parse(data.created_at as string),
    expiresAt: data.expires_at ? Date.parse(data.expires_at as string) : null,
  };
}

export async function revokeShareLink(token: string): Promise<void> {
  const { error } = await db().from('share_links').delete().eq('token', token);
  if (error) throw error;
}

/** Reading a shared script needs no session — `get_shared_script` is granted to `anon`. */
export async function getSharedScript(token: string): Promise<SharedScript | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client.rpc('get_shared_script', { p_token: token });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { project_id: string; title: string; page_size: PageSize; content: string; version: number; permission: SharePermission }
    | undefined;
  if (!row) return null;
  return {
    projectId: row.project_id,
    title: row.title,
    pageSize: row.page_size,
    content: row.content,
    version: row.version,
    permission: row.permission,
  };
}
