import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse } from '../../lib/fountain/parse';
import type { Script } from '../../lib/fountain/types';

/**
 * The script library the MCP server is allowed to touch.
 *
 * Every path from a tool call is resolved against the configured roots and
 * rejected if it lands outside them. The server is driven by a language model
 * reading file paths out of a conversation, so "the caller would not do that"
 * is not a safety argument — the check is here because the caller is not
 * trusted to be careful, only to be well-meaning.
 */

const SCRIPT_EXTENSIONS = new Set(['.fountain', '.spmd', '.txt']);

export class Library {
  constructor(private readonly roots: string[]) {
    if (roots.length === 0) {
      throw new Error('No script directory configured. Pass one as an argument.');
    }
  }

  /**
   * Resolves a caller-supplied path, refusing anything outside the roots.
   *
   * `relative()` rather than `startsWith()`: a root of `/scripts` would
   * otherwise also admit `/scripts-private`, which is a different directory.
   */
  resolvePath(input: string): string {
    const candidate = isAbsolute(input) ? resolve(input) : resolve(this.roots[0] as string, input);

    const allowed = this.roots.some((root) => {
      const rel = relative(resolve(root), candidate);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    });

    if (!allowed) {
      throw new Error(
        `Path is outside the configured script directories: ${input}. ` +
          `Allowed: ${this.roots.join(', ')}`,
      );
    }

    return candidate;
  }

  /** Every script in the library, newest first. */
  async list(): Promise<{ path: string; name: string; bytes: number; modified: string }[]> {
    const found: { path: string; name: string; bytes: number; modified: string }[] = [];

    for (const root of this.roots) {
      await this.walk(resolve(root), found, 0);
    }

    return found.sort((a, b) => b.modified.localeCompare(a.modified));
  }

  private async walk(
    dir: string,
    out: { path: string; name: string; bytes: number; modified: string }[],
    depth: number,
  ): Promise<void> {
    // Deep trees are almost always a mistake (a node_modules, a Time Machine
    // backup); stopping early keeps a stray root from hanging the server.
    if (depth > 4) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        await this.walk(full, out, depth + 1);
        continue;
      }

      if (!SCRIPT_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;

      const info = await stat(full);
      out.push({
        path: full,
        name: basename(entry.name, extname(entry.name)),
        bytes: info.size,
        modified: info.mtime.toISOString(),
      });
    }
  }

  async read(path: string): Promise<string> {
    return readFile(this.resolvePath(path), 'utf8');
  }

  async parse(path: string): Promise<Script> {
    return parse(await this.read(path));
  }

  async write(path: string, content: string): Promise<void> {
    await writeFile(this.resolvePath(path), content, 'utf8');
  }

  /** A path to show the caller — relative to its root where possible. */
  display(path: string): string {
    for (const root of this.roots) {
      const rel = relative(resolve(root), path);
      if (!rel.startsWith('..') && !isAbsolute(rel)) return rel || basename(path);
    }
    return path;
  }

  get rootList(): string[] {
    return this.roots.map((root) => resolve(root) + sep);
  }
}
