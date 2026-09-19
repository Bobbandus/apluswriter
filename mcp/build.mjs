import { build } from 'esbuild';

/**
 * Bundles the MCP server into a single file.
 *
 * Bundling rather than plain `tsc` for one concrete reason: the parser in
 * lib/fountain uses extensionless relative imports, which Node's ESM loader
 * rejects outright. esbuild resolves them at build time, so the output runs
 * under plain `node` with no loader, no flags and no dependency on the
 * repository's layout.
 */
await build({
  entryPoints: ['mcp/src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'mcp/dist/server.mjs',
  banner: {
    // Some transitive dependencies still reach for `require`.
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

console.log('built mcp/dist/server.mjs');
