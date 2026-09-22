import type { Metadata } from 'next';
import { SharedScriptReader } from '@/components/share/SharedScriptReader';

export const metadata: Metadata = {
  title: 'A+ Toolkit',
  robots: { index: false, follow: false },
};

/** Anyone with this link can read the script, so the link is the password and is never indexed. */
export default async function SharedScriptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedScriptReader token={token} />;
}
