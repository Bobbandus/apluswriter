import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Match the tsconfig paths so tests import exactly what ships.
      '@aplus/fountain': at('./packages/fountain'),
      '@aplus/paginator': at('./packages/paginator'),
      '@aplus/export': at('./packages/export'),
      '@aplus/bridge': at('./packages/bridge'),
      '@': at('./aplusweb'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'aplusweb/**/*.test.ts', 'mcp/**/*.test.ts', 'supabase/**/*.test.ts', 'aplusdesktop/**/*.test.ts'],
    // Fixture paths are resolved from the repository root.
    root: at('./'),
  },
});
