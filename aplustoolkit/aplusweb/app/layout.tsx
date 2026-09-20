import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Archivo, Archivo_Black, Courier_Prime, Inter, Space_Mono } from 'next/font/google';
import { THEME_COOKIE, defaultTheme, isTheme, resolveTheme } from '@/lib/theme';
import '@/styles/globals.css';

/* Interface type. `next/font` downloads and self-hosts these at build time —
   nothing is fetched from Google at runtime. */
const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700', '900'],
  variable: '--font-archivo',
  display: 'swap',
});

const archivoBlack = Archivo_Black({
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  variable: '--font-archivo-black',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});

/* The screenplay face. Its metrics drive pagination, so it must never fall
   back silently — `display: block` keeps the page blank rather than laying out
   at the wrong width and reflowing. */
const courierPrime = Courier_Prime({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-courier-prime',
  display: 'block',
});

export const metadata: Metadata = {
  title: 'A+ Toolkit',
  description: 'Plan, shoot and broadcast: the A+ Studios toolkit.',
  applicationName: 'A+ Toolkit',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f6' },
    { media: '(prefers-color-scheme: dark)', color: '#131317' },
  ],
};

const THEME_SCRIPT = `(function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function s(){if(d.dataset.themePref==="system")d.dataset.theme=m.matches?"dark":"light"}s();m.addEventListener("change",s)})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, store] = await Promise.all([getLocale(), getMessages(), cookies()]);

  const themeCookie = store.get(THEME_COOKIE)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : defaultTheme;

  const fontVars = [
    archivo.variable,
    archivoBlack.variable,
    inter.variable,
    spaceMono.variable,
    courierPrime.variable,
  ].join(' ');

  return (
    <html lang={locale} data-theme={resolveTheme(theme, true)} data-theme-pref={theme} className={fontVars} suppressHydrationWarning>
      <body>
        {/* "System" cannot be known on the server, so it is settled before first paint and kept in step with the OS. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
