'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase browser client — or null when the project has not been
 * configured yet.
 *
 * Returning null rather than throwing is deliberate. A writer who has never
 * set up Supabase still gets a fully working app with local projects; cloud
 * sync simply does not appear until the environment variables exist.
 */

const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
// Supabase renamed the anon key to "publishable key"; accept either.
const key =
  process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

let client: SupabaseClient | null | undefined;

export function isCloudConfigured(): boolean {
  return Boolean(url && key);
}

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client = url && key ? createBrowserClient(url, key) : null;
  return client;
}
