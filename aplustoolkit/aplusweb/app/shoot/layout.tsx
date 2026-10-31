import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { Permanent_Marker } from 'next/font/google';

/* Added to an iPad's home screen, A+ Shoot opens without Safari's bars: more room for the slate. */
export const metadata: Metadata = {
  appleWebApp: { capable: true, title: 'A+ Shoot', statusBarStyle: 'black-translucent' },
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

/* The slate is written on in marker. Loaded for the Shoot routes only. */
const marker = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-marker-face', display: 'swap' });

const alias = { '--font-marker': 'var(--font-marker-face)' } as CSSProperties;

export default function ShootLayout({ children }: { children: ReactNode }) {
  return (
    <div className={marker.variable} style={alias}>
      {children}
    </div>
  );
}
