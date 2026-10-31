import type { CSSProperties, ReactNode } from 'react';
import { Permanent_Marker } from 'next/font/google';

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
