import { describeError } from '../errors';
import type { LocalStore } from './local';
import type { CloudAdapter, ProjectLocation, SaveState } from './types';

/**
 * Keeping one open script safe.
 *
 * The rules, in the order they protect the writer:
 *
 * 1. **Local first.** Every edit lands in IndexedDB within a quarter of a
 *    second, before anything touches the network. A crash, a closed lid or a
 *    dead connection can cost at most that quarter-second.
 * 2. **The cloud follows.** A cloud project is pushed a moment after typing
 *    pauses, with the version it was last in step with. The server refuses a
 *    stale version (save_script → P0409), so two machines cannot silently
 *    overwrite each other.
 * 3. **A conflict is shown, never resolved by guessing.** If the script
 *    changed in two places, the writer sees both and chooses. Until then they
 *    can keep writing; nothing is pushed.
 * 4. **Offline is not an error.** The work is safe locally, the status says
 *    so plainly, and it syncs when the connection comes back.
 */

export interface Conflict {
  /** What the cloud has now. */
  content: string;
  version: number;
}

export interface SyncSnapshot {
  state: SaveState;
  conflict: Conflict | null;
}

export interface SyncOptions {
  /** Delay before a local write, in ms. */
  localDelay?: number;
  /** Delay after the last keystroke before a cloud push, in ms. */
  cloudDelay?: number;
  /** How often to retry a push while offline or failing, in ms. */
  retryDelay?: number;
  /** Whether the browser believes it is online. */
  isOnline?: () => boolean;
}

/** A network failure, as opposed to the server saying no. */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch() failing outright
  return /network|fetch|timeout|offline|failed to fetch/i.test(describeError(error));
}

export class DocumentSync {
  private content = '';
  private baseVersion = 0;
  private dirty = false;
  private state: SaveState = 'saving';
  private conflict: Conflict | null = null;

  private localTimer: ReturnType<typeof setTimeout> | undefined;
  private cloudTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pushing: Promise<void> | null = null;
  private pushAgain = false;
  private disposed = false;

  private readonly listeners = new Set<(snapshot: SyncSnapshot) => void>();
  private readonly options: Required<SyncOptions>;

  constructor(
    private readonly projectId: string,
    private readonly local: LocalStore,
    private readonly cloud: CloudAdapter | null,
    private readonly location: ProjectLocation,
    options: SyncOptions = {},
  ) {
    this.options = {
      localDelay: 250,
      cloudDelay: 1500,
      retryDelay: 15_000,
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
      ...options,
    };
  }

  private get syncsToCloud(): boolean {
    return this.location === 'cloud' && this.cloud !== null;
  }

  /* ------------------------------------------------------------ observers */

  snapshot(): SyncSnapshot {
    return { state: this.state, conflict: this.conflict };
  }

  subscribe(listener: (snapshot: SyncSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(state: SaveState): void {
    this.state = state;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  /* ----------------------------------------------------------------- open */

  /**
   * Loads the script, reconciling the local copy with the cloud.
   * Returns the text the editor should show.
   */
  async load(): Promise<string> {
    const cached = await this.local.getScript(this.projectId);

    if (!this.syncsToCloud) {
      this.content = cached?.content ?? '';
      this.set('local');
      return this.content;
    }

    let remote: { content: string; version: number } | null;
    try {
      remote = await (this.cloud as CloudAdapter).loadScript(this.projectId);
    } catch {
      // Cannot reach the cloud: the local copy is the truth for now.
      this.content = cached?.content ?? '';
      this.baseVersion = cached?.baseVersion ?? 0;
      this.dirty = cached?.dirty ?? false;
      this.set('offline');
      this.scheduleRetry();
      return this.content;
    }

    if (!remote) {
      // Known locally, missing in the cloud: keep the local text and push it.
      this.content = cached?.content ?? '';
      this.baseVersion = 0;
      this.dirty = true;
      this.set('saving');
      this.schedulePush(0);
      return this.content;
    }

    if (!cached) {
      this.adopt(remote.content, remote.version);
      await this.writeLocal();
      this.set('saved');
      return this.content;
    }

    if (!cached.dirty) {
      // Nothing unsaved here, so the cloud (which is at least as new) wins.
      this.adopt(remote.content, remote.version);
      await this.writeLocal();
      this.set('saved');
      return this.content;
    }

    // Unsaved local work.
    this.content = cached.content;
    this.dirty = true;

    if (remote.version === cached.baseVersion) {
      // Nobody else saved in the meantime: push ours.
      this.baseVersion = remote.version;
      this.set('saving');
      this.schedulePush(0);
      return this.content;
    }

    if (remote.content === cached.content) {
      // Both sides arrived at the same text. Not a conflict.
      this.adopt(remote.content, remote.version);
      await this.writeLocal();
      this.set('saved');
      return this.content;
    }

    // Changed in two places. Show the writer's own version and ask.
    this.baseVersion = cached.baseVersion;
    this.conflict = { content: remote.content, version: remote.version };
    this.set('conflict');
    return this.content;
  }

  private adopt(content: string, version: number): void {
    this.content = content;
    this.baseVersion = version;
    this.dirty = false;
  }

  /* --------------------------------------------------------------- editing */

  update(content: string): void {
    if (this.disposed || content === this.content) return;
    this.content = content;
    this.dirty = true;

    if (this.state !== 'conflict') this.set('saving');

    clearTimeout(this.localTimer);
    this.localTimer = setTimeout(() => void this.writeLocalAndReport(), this.options.localDelay);

    if (this.syncsToCloud && !this.conflict) this.schedulePush(this.options.cloudDelay);
  }

  private async writeLocal(): Promise<void> {
    await this.local.putScript({
      projectId: this.projectId,
      content: this.content,
      baseVersion: this.baseVersion,
      dirty: this.dirty,
      updatedAt: Date.now(),
    });
  }

  private async writeLocalAndReport(): Promise<void> {
    try {
      await this.writeLocal();
    } catch {
      this.set('error');
      return;
    }
    if (!this.syncsToCloud) this.set('local');
    else if (!this.options.isOnline() && this.state !== 'conflict') this.set('offline');
  }

  /* ------------------------------------------------------------------ push */

  private schedulePush(delay: number): void {
    clearTimeout(this.cloudTimer);
    this.cloudTimer = setTimeout(() => void this.push(), delay);
  }

  private scheduleRetry(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.push(), this.options.retryDelay);
  }

  /** Pushes the current text to the cloud, if there is anything to push. */
  push(): Promise<void> {
    if (!this.syncsToCloud || this.conflict || this.disposed) return Promise.resolve();
    if (this.pushing) {
      this.pushAgain = true;
      return this.pushing;
    }
    this.pushing = this.pushOnce().finally(() => {
      this.pushing = null;
      if (this.pushAgain) {
        this.pushAgain = false;
        void this.push();
      }
    });
    return this.pushing;
  }

  private async pushOnce(): Promise<void> {
    if (!this.dirty) {
      if (this.state !== 'conflict') this.set('saved');
      return;
    }
    if (!this.options.isOnline()) {
      this.set('offline');
      this.scheduleRetry();
      return;
    }

    const sent = this.content;
    this.set('syncing');

    try {
      const result = await (this.cloud as CloudAdapter).saveScript(this.projectId, sent, this.baseVersion);

      if (!result.ok) {
        this.conflict = result.conflict;
        this.set('conflict');
        return;
      }

      this.baseVersion = result.version;
      // Typing may have continued while the save was in flight.
      this.dirty = this.content !== sent;
      await this.writeLocal();

      if (this.dirty) {
        this.set('saving');
        this.schedulePush(this.options.cloudDelay);
      } else {
        this.set('saved');
      }
    } catch (error) {
      this.set(isNetworkError(error) || !this.options.isOnline() ? 'offline' : 'error');
      this.scheduleRetry();
    }
  }

  /* -------------------------------------------------------------- conflict */

  /**
   * Settles a conflict. Returns the text the editor should now show.
   *
   * `mine` saves the writer's version over the cloud's, *knowingly* — this is
   * the only path where a newer cloud version is replaced, and it only runs
   * after the writer has seen both. `theirs` takes the cloud's text and drops
   * the local changes.
   */
  async resolve(choice: 'mine' | 'theirs'): Promise<string> {
    const conflict = this.conflict;
    if (!conflict) return this.content;

    if (choice === 'theirs') {
      this.conflict = null;
      this.adopt(conflict.content, conflict.version);
      await this.writeLocal();
      this.set('saved');
      return this.content;
    }

    this.conflict = null;
    this.baseVersion = conflict.version;
    this.dirty = true;
    await this.writeLocal();
    await this.push();
    return this.content;
  }

  /* ------------------------------------------------------------ lifecycle */

  /** Writes everything now. Called when the page is being hidden or closed. */
  async flush(): Promise<void> {
    clearTimeout(this.localTimer);
    clearTimeout(this.cloudTimer);
    await this.writeLocal();
    if (this.syncsToCloud && this.dirty && !this.conflict) await this.push();
    else if (!this.syncsToCloud) this.set('local');
  }

  /** The browser came back online: try again straight away. */
  online(): void {
    if (this.state === 'offline' || this.state === 'error') void this.push();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.localTimer);
    clearTimeout(this.cloudTimer);
    clearTimeout(this.retryTimer);
    this.listeners.clear();
  }
}
