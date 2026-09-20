'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { getSupabase } from '@/lib/supabase/client';
import styles from './LoginForm.module.css';

/**
 * Google is offered only once the provider has been set up in Supabase
 * (`NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN=1`). An unconfigured provider answers with
 * a raw JSON error page, which is worse than no button.
 */
const GOOGLE_ENABLED = process.env['NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN'] === '1';

/** Supabase refuses a magic link for an address that has no account. */
const NOT_INVITED = /signups? not allowed|otp_disabled/i;

/**
 * Signing in: an email link, and Google when it is set up. No passwords to
 * invent or forget.
 *
 * Accounts are invite-only. `shouldCreateUser: false` keeps the app from
 * creating one by accident; the real lock is the "Allow new users to sign up"
 * switch in Supabase (see supabase/README.md).
 *
 * If Supabase is not configured yet the page says so plainly and offers the
 * way on without an account — the app is fully usable locally, and a writer
 * should never meet a dead end on the way to their script.
 */
export function LoginForm() {
  const t = useTranslations('auth');
  const db = getSupabase();

  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const redirectTo = typeof window === 'undefined' ? undefined : `${window.location.origin}/auth/callback`;

  const sendLink = async () => {
    if (!db || !email.trim()) return;
    setState('sending');
    setError(null);
    const { error: failure } = await db.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, ...(redirectTo ? { emailRedirectTo: redirectTo } : {}) },
    });
    if (failure) {
      setError(NOT_INVITED.test(`${failure.code ?? ''} ${failure.message}`) ? t('notInvited') : failure.message);
      setState('error');
    } else {
      setState('sent');
    }
  };

  const google = async () => {
    if (!db) return;
    await db.auth.signInWithOAuth({ provider: 'google', options: redirectTo ? { redirectTo } : {} });
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.brand}>
          A<span className={styles.plus}>+</span> Toolkit
        </span>
        <h1 className={styles.title}>{t('signInTitle')}</h1>

        {!db ? (
          <>
            <p className={styles.note}>{t('notConfigured')}</p>
            <Link href="/" className={styles.local}>
              {t('continueLocal')} →
            </Link>
          </>
        ) : state === 'sent' ? (
          <p className={styles.sent} role="status">
            {t('magicLinkSent')}
          </p>
        ) : (
          <>
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void sendLink();
              }}
            >
              <label className={styles.label}>
                {t('email')}
                <input
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="namn@exempel.se"
                />
              </label>
              <Button type="submit" variant="primary" disabled={state === 'sending'}>
                {state === 'sending' ? t('sending') : t('signInWithEmail')}
              </Button>
              <p className={styles.hint}>{t('signInHint')}</p>
            </form>

            {GOOGLE_ENABLED && (
              <>
                <div className={styles.or}>
                  <span>{t('or')}</span>
                </div>

                <Button variant="secondary" onClick={() => void google()}>
                  {t('signInWithGoogle')}
                </Button>
              </>
            )}

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <Link href="/" className={styles.local}>
              {t('continueLocal')} →
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
