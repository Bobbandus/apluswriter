import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Packs the MCP server as a Claude Desktop extension (.mcpb).
 *
 * Why an extension and not an entry in claude_desktop_config.json: Claude
 * Desktop runs extensions with the Node it ships with, so nobody has to have
 * Node installed; it shows its own install dialog, with a folder picker for
 * the scripts directory; and there is no config file to get a comma wrong in.
 * The server itself is the same single bundled file either way.
 *
 * Built into aplusdesktop/release (published with the installer) and copied
 * into the desktop bundle, which is what the app opens on "Connect Claude".
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stage = join(root, 'mcp', '.mcpb-stage');
const file = 'aplus-toolkit.mcpb';

const version = JSON.parse(await readFile(join(root, 'aplusdesktop', 'package.json'), 'utf8')).version;

const manifest = {
  manifest_version: '0.3',
  name: 'aplus-toolkit',
  display_name: 'A+ Toolkit',
  version,
  description: 'Låter Claude läsa dina manus och föreslå ändringar som du själv godkänner i A+ Toolkit.',
  long_description:
    'Claude ser vad du har öppet i A+ Toolkit och kan läsa dina manus, analysera struktur och svårighetsgrad, och ' +
    'skicka förslag: shotlists, omskrivningar, alternativ och nya scener. Allt kommer som kort i appen. ' +
    'Inget ändras i manuset förrän du klickar Använd, och Ctrl+Z tar tillbaka det.',
  author: { name: 'A+ Studios', url: 'https://toolkit.aplusfilm.se' },
  homepage: 'https://toolkit.aplusfilm.se',
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'server/server.mjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/server.mjs', '${user_config.scripts_dirs}'],
    },
  },
  tools_generated: true,
  prompts_generated: true,
  user_config: {
    scripts_dirs: {
      type: 'directory',
      title: 'Manusmappar',
      description: 'Mappar med .fountain-filer som Claude får läsa och kommentera. Det öppna manuset i appen behöver ingen mapp.',
      multiple: true,
      required: true,
      default: ['${DOCUMENTS}/Manus'],
    },
  },
  compatibility: { platforms: ['win32', 'darwin'], runtimes: { node: '>=18.0.0' } },
};

/* Pinned on purpose. `npx --yes @anthropic-ai/mcpb` fetches whatever is current
   at build time, which means an upstream change can break a release build that
   nothing in this repository touched. Raise it deliberately. */
const MCPB = '@anthropic-ai/mcpb@2.1.2';

const run = (args, cwd = root) =>
  execFileSync('npx', ['--yes', MCPB, ...args], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

// The server and the icon are built first: this script only packs.
execFileSync('node', ['mcp/build.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync('node', ['scripts/make-icon.mjs'], { cwd: root, stdio: 'inherit' });

await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, 'server'), { recursive: true });
await cp(join(root, 'mcp', 'dist', 'server.mjs'), join(stage, 'server', 'server.mjs'));
await cp(join(root, 'aplusdesktop', 'build', 'icon-512.png'), join(stage, 'icon.png'));
await writeFile(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log('• validating the manifest');
run(['validate', join(stage, 'manifest.json')]);

const out = join(root, 'aplusdesktop', 'release');
await mkdir(out, { recursive: true });
console.log('• packing');
run(['pack', stage, join(out, file)]);

// The desktop bundle carries a copy, so the app can open it without a download.
const bundle = join(root, 'aplusdesktop', 'bundle');
await mkdir(bundle, { recursive: true });
await cp(join(out, file), join(bundle, file));

await rm(stage, { recursive: true, force: true });
console.log(`\nready: aplusdesktop/release/${file}`);
