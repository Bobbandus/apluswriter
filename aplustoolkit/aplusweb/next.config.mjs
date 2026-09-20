import createNextIntlPlugin from 'next-intl/plugin';

// Locale is a user setting (a cookie), not a URL segment — so no i18n routing.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A build and a running dev server must not share one folder: `next build`
  // overwrites what `next dev` is serving, and the dev server then answers
  // 500 until it is restarted. Checks and the desktop build set
  // APLUS_DIST_DIR to keep their output apart. Unset, this is Next's default.
  distDir: process.env['APLUS_DIST_DIR'] || '.next',
};

export default withNextIntl(nextConfig);
