import type { CSSProperties, ReactNode } from 'react';
import { Barlow_Condensed, Montserrat, Silkscreen } from 'next/font/google';

/*
  The typefaces the overlays are drawn in. They are loaded here, for the live routes only, so the writing app
  never pays for them. Each design names one through its theme: condensed for broadcast panels, a heavy sans for
  bars and name blocks, a pixel face for the Minecraft frame.
*/
const condensed = Barlow_Condensed({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-live-condensed', display: 'swap' });
const sans = Montserrat({ subsets: ['latin'], weight: ['500', '700', '800', '900'], variable: '--font-live-sans', display: 'swap' });
const pixel = Silkscreen({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-live-pixel', display: 'swap' });

const aliases = { '--font-live-display': 'var(--font-black)', '--font-live-mono': 'var(--font-mono)' } as CSSProperties;

export default function LiveLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${condensed.variable} ${sans.variable} ${pixel.variable}`} style={aliases}>
      {children}
    </div>
  );
}
