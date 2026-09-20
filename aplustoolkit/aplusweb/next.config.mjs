import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

// Locale is a user setting (a cookie), not a URL segment — so no i18n routing.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/**
 * The desktop build bundles its own server, so the app runs with no dev server
 * and no internet. Vercel must not see any of this: `standalone` there would
 * change what gets deployed for no reason, so it is switched on only by
 * scripts/build-desktop.mjs.
 */
const forDesktop = process.env['APLUS_DESKTOP_BUILD'] === '1';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(forDesktop
    ? {
        output: 'standalone',
        // The parser and paginator live in ../packages, outside this folder.
        // Without this, tracing stops at aplusweb/ and the bundle is missing
        // half the app.
        outputFileTracingRoot: repoRoot,
      }
    : {}),
  // A build and a running dev server must not share one folder: `next build`
  // overwrites what `next dev` is serving, and the dev server then answers
  // 500 until it is restarted. Checks and the desktop build set
  // APLUS_DIST_DIR to keep their output apart. Unset, this is Next's default.
  distDir: process.env['APLUS_DIST_DIR'] || '.next',
};

export default withNextIntl(nextConfig);
