import type { LocalStore } from './local';
import type { CloudAdapter } from './types';

/**
 * Keeps one JSON document beside a script (a set of shotlists, a stripboard)
 * in step with the cloud.
 *
 * Much simpler than the script's sync on purpose. These documents are small,
 * whole-value and rarely edited from two places at once, so the rule is the
 * plain one: every change lands on this computer first, marked unsaved, and
 * is pushed a moment later. On open, anything unsaved here is pushed; if
 * nothing is, the cloud's copy is taken. The last save wins — for a
 * shotlist that is the behaviour a producer expects, and it is never the
 * *script* that is at stake.
 *
 * A local project never touches the network: `cloud` is null.
 */
export class DataSync<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: T | null = null;
  private hasPending = false;
  private disposed = false;

  constructor(
    private readonly projectId: string,
    private readonly key: string,
    private readonly local: LocalStore,
    private readonly cloud: CloudAdapter | null,
    private readonly delay = 800,
  ) {}

  async load(): Promise<T | null> {
    const row = await this.local.getDataRow(this.projectId, this.key);
    const mine = (row?.value as T | undefined) ?? null;
    if (!this.cloud) return mine;

    let remote: T | null;
    try {
      remote = await this.cloud.loadData<T>(this.projectId, this.key);
    } catch {
      // Offline or refused: what is here is the truth for now, and stays
      // marked unsaved so the next open or edit pushes it.
      return mine;
    }

    if (row?.dirty || (row && remote === null)) {
      // Unsaved here, or here from before the project moved to the cloud.
      this.queue(mine as T, 0);
      return mine;
    }
    if (remote !== null) {
      await this.local.putData(this.projectId, this.key, remote);
      return remote;
    }
    return mine;
  }

  /** Writes to this computer now, and to the cloud shortly. */
  async update(value: T): Promise<void> {
    await this.local.putData(this.projectId, this.key, value, this.cloud !== null);
    if (this.cloud) this.queue(value, this.delay);
  }

  private queue(value: T, delay: number) {
    this.pending = value;
    this.hasPending = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  /** Pushes what is waiting, now. Safe to call with nothing waiting. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.cloud || !this.hasPending) return;
    const value = this.pending as T;
    this.hasPending = false;
    this.pending = null;
    try {
      await this.cloud.saveData(this.projectId, this.key, value);
      await this.local.markDataClean(this.projectId, this.key, value);
    } catch {
      // Stays marked unsaved locally; the next open pushes it. Retrying in a
      // loop here would hammer a server that just said no (a viewer's role,
      // say) and change nothing.
      if (!this.disposed && !this.hasPending) {
        this.pending = value;
        this.hasPending = true;
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
