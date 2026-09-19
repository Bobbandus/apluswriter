'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase/client';

/**
 * Where the email link and Google send the writer back to.
 *
 * Client-side on purpose: the whole app is, so the desktop build can serve
 * it from disk. The code in the URL is exchanged for a session here, then the
 * writer lands on their projects.
 */
export function AuthCallback() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const db = getSupabase();
    const code = new URLSearchParams(window.location.search).get('code');
    if (!db || !code) {
      router.replace('/');
      return;
    }
    void db.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setFailed(true);
      else router.replace('/');
    });
  }, [router]);

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', color: 'var(--text-muted)' }}>
      <p role="status">{failed ? t('callbackFailed') : t('callbackWorking')}</p>
    </main>
  );
}
