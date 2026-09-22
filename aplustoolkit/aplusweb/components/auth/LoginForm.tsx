'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

/** Supabase refuses a magic link, or a reset link, for an address that has no account. */
const NOT_INVITED = /signups? not allowed|otp_disabled/i;

type Mode = 'password' | 'link';
type State = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Signing in: a password by default, with an email link kept as the way in
 * for someone who has never set one — an invitation's own link, or "forgot
 * password" below.
 *
 * Passwords exist because Supabase's own mail sender is rate-limited to a
 * handful of messages an hour, and a link on every sign-in ran into that on a
 * team of any size. A password means most sign-ins send no mail at all; the
 * link is still there for the two moments that need it.
 *
 * Accounts are invite-only — the real lock is the "Allow new users to sign
 * up" switch in Supabase (see supabase/README.md), not anything client-side.
 *
 * If Supabase is not configured yet the page says so plainly and offers the
 * way on without an account — the app is fully usable locally, and a writer
 * should never meet a dead end on the way to their script.
 */
export function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const db = getSupabase();

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  const redirectTo = typeof window === 'undefined' ? undefined : `${window.location.origin}/auth/callback`;
  const resetRedirectTo = typeof window === 'undefined' ? undefined : `${window.location.origin}/auth/reset-password`;

  const fail = (failure: { code?: string; message: string }) => {
    setError(NOT_INVITED.test(`${failure.code ?? ''} ${failure.message}`) ? t('notInvited') : failure.message);
    setState('error');
  };

  const signIn = async () => {
    if (!db || !email.trim() || !password) return;
    setState('sending');
    setError(null);
    const { error: failure } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (failure) fail(failure);
    else router.replace('/');
  };

  const sendLink = async () => {
    if (!db || !email.trim()) return;
    setState('sending');
    setError(null);
    const { error: failure } = await db.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, ...(redirectTo ? { emailRedirectTo: redirectTo } : {}) },
    });
    if (failure) fail(failure);
    else setState('sent');
  };

  const sendReset = async () => {
    if (!db || !email.trim()) return;
    setState('sending');
    setError(null);
    const { error: failure } = await db.auth.resetPasswordForEmail(email.trim(), {
      ...(resetRedirectTo ? { redirectTo: resetRedirectTo } : {}),
    });
    if (failure) fail(failure);
    else setState('sent');
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
            {mode === 'link' ? t('magicLinkSent') : t('resetLinkSent')}
          </p>
        ) : mode === 'password' ? (
          <>
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void signIn();
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
              <label className={styles.label}>
                {t('password')}
                <input
                  className={styles.input}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <Button type="submit" variant="primary" disabled={state === 'sending'}>
                {state === 'sending' ? t('sending') : t('signIn')}
              </Button>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  setError(null);
                  void sendReset();
                }}
              >
                {t('forgotPassword')}
              </button>
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

            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setError(null);
                setState('idle');
                setMode('link');
              }}
            >
              {t('useLinkInstead')}
            </button>

            <Link href="/" className={styles.local}>
              {t('continueLocal')} →
            </Link>
          </>
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

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setError(null);
                setState('idle');
                setMode('password');
              }}
            >
              {t('usePasswordInstead')}
            </button>

            <Link href="/" className={styles.local}>
              {t('continueLocal')} →
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
