import createNextIntlPlugin from 'next-intl/plugin';

// Locale is a user setting (a cookie), not a URL segment — so no i18n routing.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
