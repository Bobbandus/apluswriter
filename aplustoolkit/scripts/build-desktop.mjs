import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds everything the desktop app ships with.
 *
 * The point of a bundled server rather than a hosted URL: the writer's script
 * is on their machine, the bridge to Claude is on their machine, and neither
 * should stop working because the wifi did. So the desktop build carries its
 * own Next server and serves it from 127.0.0.1.
 *
 * Output lands in `aplusdesktop/app/`, which electron-builder copies into the
 * installer's resources. Nothing here touches `aplusweb/.next`, so a dev
 * server can keep running while this builds.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'aplusweb');
const DIST = '.next-desktop';
// Not "app": Electron treats `resources/app` as an unpacked application
// directory, and we ship an asar.
const out = join(root, 'aplusdesktop', 'bundle');

const run = (command, args, env = {}) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });

async function main() {
  console.log('• building the web app (standalone)');
  await rm(out, { recursive: true, force: true });
  await rm(join(web, DIST), { recursive: true, force: true });
  run('npx', ['next', 'build', 'aplusweb'], { APLUS_DESKTOP_BUILD: '1', APLUS_DIST_DIR: DIST });

  const standalone = join(web, DIST, 'standalone');
  if (!existsSync(standalone)) throw new Error(`no standalone output at ${standalone}`);

  console.log('• collecting it into aplusdesktop/app');
  await cp(standalone, out, { recursive: true });

  // Where server.js ended up: tracing from the repo root mirrors the path, so
  // it is app/aplusweb/server.js — but the layout is Next's to decide, so it
  // is found rather than assumed.
  const entry = await findServer(out);
  if (!entry) throw new Error('no server.js in the standalone output');
  const appDir = dirname(entry);

  // Static assets and public files are deliberately left out of `standalone`,
  // because a hosted deployment serves them from a CDN. We are the CDN.
  await cp(join(web, DIST, 'static'), join(appDir, DIST, 'static'), { recursive: true });
  if (existsSync(join(web, 'public'))) {
    await cp(join(web, 'public'), join(appDir, 'public'), { recursive: true });
  }

  console.log('• building the MCP server');
  run('node', ['mcp/build.mjs']);
  await mkdir(join(out, 'mcp'), { recursive: true });
  await cp(join(root, 'mcp', 'dist', 'server.mjs'), join(out, 'mcp', 'server.mjs'));

  // A note for the shell, so it does not have to guess at the layout either.
  await writeFile(
    join(out, 'aplus-app.json'),
    `${JSON.stringify({ server: relative(out, entry).split('\\').join('/'), mcp: 'mcp/server.mjs' }, null, 2)}\n`,
  );

  await rm(join(web, DIST), { recursive: true, force: true });
  console.log(`\nready: ${relative(root, out)} (${await sizeOf(out)})`);
}

/** Breadth-first, so the shallowest server.js wins. */
async function findServer(dir, depth = 0) {
  if (depth > 3) return null;
  const entries = await readdir(dir, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === 'server.js')) return join(dir, 'server.js');
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const found = await findServer(join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

async function sizeOf(dir) {
  let bytes = 0;
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else bytes += (await stat(full)).size;
    }
  };
  await walk(dir);
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

await main();
