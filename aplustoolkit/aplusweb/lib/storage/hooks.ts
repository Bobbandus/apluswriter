'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase, isCloudConfigured } from '@/lib/supabase/client';
import { SupabaseAdapter } from './cloud';
import { localStore } from './local';
import { ProjectRepository } from './projects';
import { DataSync } from './dataSync';
import { DocumentSync, type Conflict } from './sync';
import type { ProjectMeta, SaveState } from './types';
import type { PageSize } from '@aplus/paginator/geometry';

/* ========================================================================== */
/* Session                                                                    */
/* ========================================================================== */

export interface Session {
  /** False until the stored session has been read — avoids a signed-out flash. */
  ready: boolean;
  email: string | null;
  /** Cloud sync exists at all (the Supabase env vars are set). */
  configured: boolean;
}

export function useSession(): Session {
  const [session, setSession] = useState<Session>({ ready: false, email: null, configured: isCloudConfigured() });

  useEffect(() => {
    const db = getSupabase();
    if (!db) {
      setSession({ ready: true, email: null, configured: false });
      return;
    }
    void db.auth.getSession().then(({ data }) =>
      setSession({ ready: true, email: data.session?.user.email ?? null, configured: true }),
    );
    const { data } = db.auth.onAuthStateChange((_event, next) =>
      setSession({ ready: true, email: next?.user.email ?? null, configured: true }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

/* ========================================================================== */
/* Repository                                                                 */
/* ========================================================================== */

/** The project repository, with the cloud attached only while signed in. */
export function useRepository(): { repo: ProjectRepository; session: Session } {
  const session = useSession();
  const signedIn = Boolean(session.email);
  const repo = useMemo(() => {
    const db = getSupabase();
    return new ProjectRepository(localStore(), signedIn && db ? new SupabaseAdapter(db) : null);
  }, [signedIn]);
  return { repo, session };
}

/* ========================================================================== */
/* One open document                                                          */
/* ========================================================================== */

export interface ProjectDocument {
  /** False until the script has been loaded; the editor must not mount before. */
  ready: boolean;
  meta: ProjectMeta | null;
  /** The text to open with — and, after "use theirs", the text to switch to. */
  content: string;
  /** Bumps whenever `content` is replaced from outside the editor. */
  revision: number;
  state: SaveState;
  conflict: Conflict | null;
  update: (content: string) => void;
  resolve: (choice: 'mine' | 'theirs') => Promise<void>;
  rename: (title: string) => Promise<void>;
  setPageSize: (size: PageSize) => Promise<void>;
  /** Stores page and scene counts for the dashboard. */
  recordStats: (stats: { pages?: number; scenes?: number }) => void;
}

export function useProjectDocument(projectId: string, untitled: string): ProjectDocument {
  const { repo, session } = useRepository();
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [content, setContent] = useState('');
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<SaveState>('saving');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const syncRef = useRef<DocumentSync | null>(null);

  useEffect(() => {
    // Wait until we know whether there is a session, so a cloud project is
    // never opened in local-only mode and then "saved" without its cloud.
    if (!session.ready) return;

    let cancelled = false;
    let sync: DocumentSync | null = null;

    void (async () => {
      await repo.migrateLegacy(untitled);
      const project = await repo.ensure(projectId, untitled);
      if (cancelled) return;

      const db = getSupabase();
      const cloud = project.location === 'cloud' && session.email && db ? new SupabaseAdapter(db) : null;
      sync = new DocumentSync(projectId, localStore(), cloud, project.location);
      syncRef.current = sync;
      sync.subscribe((snapshot) => {
        setState(snapshot.state);
        setConflict(snapshot.conflict);
      });

      const text = await sync.load();
      if (cancelled) return;

      setMeta(project);
      setContent(text);
      setRevision((r) => r + 1);
      const first = sync.snapshot();
      setState(first.state);
      setConflict(first.conflict);
      setReady(true);
    })();

    const flush = () => void syncRef.current?.flush();
    const online = () => syncRef.current?.online();
    // `pagehide` fires on close and on mobile tab switches where `unload` does not.
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', flush);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', flush);
      if (sync) {
        void sync.flush().finally(() => sync?.dispose());
      }
      syncRef.current = null;
    };
    // `untitled` is a translated string; re-opening the document because the
    // language changed would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, repo, session.ready, session.email]);

  const update = useCallback((next: string) => {
    syncRef.current?.update(next);
  }, []);

  const resolve = useCallback(async (choice: 'mine' | 'theirs') => {
    const sync = syncRef.current;
    if (!sync) return;
    const text = await sync.resolve(choice);
    if (choice === 'theirs') {
      setContent(text);
      setRevision((r) => r + 1);
    }
  }, []);

  const rename = useCallback(
    async (title: string) => {
      await repo.rename(projectId, title);
      setMeta((current) => (current ? { ...current, title } : current));
    },
    [projectId, repo],
  );

  const setPageSize = useCallback(
    async (pageSize: PageSize) => {
      setMeta((current) => (current ? { ...current, pageSize } : current));
      await repo.setPageSize(projectId, pageSize);
    },
    [projectId, repo],
  );

  const recordStats = useCallback(
    (stats: { pages?: number; scenes?: number }) => void repo.recordStats(projectId, stats),
    [projectId, repo],
  );

  return { ready, meta, content, revision, state, conflict, update, resolve, rename, setPageSize, recordStats };
}

/* ========================================================================== */
/* Reading a script without editing it                                        */
/* ========================================================================== */

export interface ProjectSource {
  status: 'loading' | 'missing' | 'ready';
  meta: ProjectMeta | null;
  source: string;
}

/**
 * A project's script, read-only, for the pages that plan *from* a script
 * (shotlist, stripboard) without editing it.
 *
 * Unlike `useProjectDocument` it never creates a project for an unknown id —
 * a mistyped link must say "not found", not leave an empty project behind.
 * It reads again whenever the tab comes back into view, so a scene written in
 * the editor in another tab is on the stripboard when the producer returns.
 */
export function useProjectSource(projectId: string): ProjectSource {
  const { repo, session } = useRepository();
  const [state, setState] = useState<ProjectSource>({ status: 'loading', meta: null, source: '' });

  useEffect(() => {
    if (!session.ready) return;
    let cancelled = false;

    const read = async () => {
      let meta = await repo.get(projectId);
      // Not on this computer yet: it may be a cloud project opened here first.
      if (!meta && session.email) {
        await repo.list();
        meta = await repo.get(projectId);
      }
      if (cancelled) return;
      if (!meta) {
        setState({ status: 'missing', meta: null, source: '' });
        return;
      }
      const db = getSupabase();
      const cloud = meta.location === 'cloud' && session.email && db ? new SupabaseAdapter(db) : null;
      const sync = new DocumentSync(projectId, localStore(), cloud, meta.location);
      try {
        const source = await sync.load();
        if (!cancelled) {
          setState((current) =>
            current.status === 'ready' && current.source === source && current.meta?.title === meta.title
              ? current
              : { status: 'ready', meta, source },
          );
        }
      } finally {
        sync.dispose();
      }
    };

    void read();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [projectId, repo, session.ready, session.email]);

  return state;
}

/* ========================================================================== */
/* Structured project data                                                    */
/* ========================================================================== */

/**
 * Where a project's data should sync: the cloud adapter when the project
 * lives in the cloud and someone is signed in, otherwise nowhere.
 */
async function dataCloudFor(projectId: string): Promise<SupabaseAdapter | null> {
  const db = getSupabase();
  if (!db) return null;
  const meta = await localStore().getProject(projectId);
  if (meta?.location !== 'cloud') return null;
  const { data } = await db.auth.getSession();
  return data.session ? new SupabaseAdapter(db) : null;
}

/**
 * A JSON document kept beside the script: shotlists, the stripboard, saved
 * assistant texts, character profiles. Not script text, so it never goes
 * through the script's sync engine or its version check. Written to this
 * computer at once, and — for a cloud project — to the cloud a moment later,
 * so a shotlist made on the laptop is there on the phone on set.
 */
export function useProjectData<T>(
  projectId: string,
  key: string,
  initial: T,
): [T, (next: T | ((previous: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const latest = useRef(value);
  const initialRef = useRef(initial);
  const syncRef = useRef<DataSync<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sync: DataSync<T> | null = null;
    setReady(false);
    void (async () => {
      const cloud = await dataCloudFor(projectId).catch(() => null);
      if (cancelled) return;
      sync = new DataSync<T>(projectId, key, localStore(), cloud);
      syncRef.current = sync;
      const stored = await sync.load();
      if (cancelled) return;
      latest.current = stored ?? initialRef.current;
      setValue(latest.current);
      setReady(true);
    })();

    const flush = () => void syncRef.current?.flush();
    // Back in view: read again, so an edit made in another tab (the shotlist
    // page beside the editor) is what this tab builds on, not a stale copy
    // it would write back over it.
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        flush();
        return;
      }
      const current = syncRef.current;
      if (!current) return;
      const before = latest.current;
      void current.flush().then(async () => {
        const fresh = await current.load();
        // Anything typed while this was reading is newer than what it read.
        if (cancelled || syncRef.current !== current || fresh === null || latest.current !== before) return;
        if (JSON.stringify(fresh) === JSON.stringify(latest.current)) return;
        latest.current = fresh;
        setValue(fresh);
      });
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisible);
      if (sync) {
        const done = sync;
        void done.flush().finally(() => done.dispose());
      }
      syncRef.current = null;
    };
  }, [projectId, key]);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(latest.current) : next;
      latest.current = resolved;
      setValue(resolved);
      const sync = syncRef.current;
      if (sync) void sync.update(resolved);
      else void localStore().putData(projectId, key, resolved);
    },
    [projectId, key],
  );

  return [value, update, ready];
}
