'use client';

import { getSupabase } from '@/lib/supabase/client';
import { LOCAL_PREFIX, localStore } from './localStore';
import { supabaseStore } from './supabaseStore';
import { LiveError, type LiveStore } from './types';

/**
 * The store a token belongs to: a local token is a board in this browser, anything else is in Supabase. Throws
 * `notConfigured` when it is a Supabase token and the project has no Supabase keys, so a page can say so
 * instead of showing an empty board.
 */
export function storeForToken(token: string): LiveStore {
  if (token.startsWith(LOCAL_PREFIX)) return localStore;
  const client = getSupabase();
  if (!client) throw new LiveError('notConfigured', 'Supabase is not configured.');
  return supabaseStore(client);
}

/** The store the owner's page works against: Supabase when it is there and the person is signed in, else this browser. */
export function ownerStore(signedIn: boolean): LiveStore {
  const client = getSupabase();
  return client && signedIn ? supabaseStore(client) : localStore;
}

export { LiveError };
