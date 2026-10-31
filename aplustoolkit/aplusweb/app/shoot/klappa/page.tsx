import type { Metadata, Viewport } from 'next';
import { Slate } from '@/components/shoot/Slate';

export const metadata: Metadata = { title: 'Klappa · A+ Shoot' };

/* A slate is held up to a camera: no zooming by accident, and dark around it. */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, themeColor: '#0d0d10', viewportFit: 'cover' };

export default function SlatePage() {
  return <Slate />;
}
