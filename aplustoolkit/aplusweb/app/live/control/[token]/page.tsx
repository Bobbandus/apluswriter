import type { Metadata } from 'next';
import { ControlPanel } from '@/components/live/ControlPanel';

export const metadata: Metadata = {
  title: 'A+ Live',
  robots: { index: false, follow: false },
};

/** The operator's page. Anyone with this link can change the board, so the link is the password and is never indexed. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ControlPanel token={token} />;
}
