'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { getSupabase } from '@/lib/supabase/client';
// The card is visually identical to the sign-in page, so it shares that
// stylesheet rather than repeating the same tokens under a new name.
import styles from './LoginForm.module.css';

type Stage = 'exchanging' | 'ready' | 'saving' | 'saved' | 'failed';

/**
 * Where "Glömt lösenordet?" sends a writer back to.
 *
 * A recovery link proves who you are on its own — Supabase signs you in the
 * moment the code is exchanged, same as a magic link — so this only ever
 * asks for the *new* password, never the old one.
 */
export function ResetPassword() {
  const t = useTranslations('auth');
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('exchanging');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = getSupabase();
    const code = new URLSearchParams(window.location.search).get('code');
    if (!db || !code) {
      setStage('failed');
      return;
    }
    void db.auth.exchangeCodeForSession(code).then(({ error: failure }) => {
      setStage(failure ? 'failed' : 'ready');
    });
  }, []);

  const save = async () => {
    const db = getSupabase();
    if (!db) return;
    if (password !== confirm) {
      setError(t('passwordMismatch'));
      return;
    }
    setStage('saving');
    setError(null);
    const { error: failure } = await db.auth.updateUser({ password });
    if (failure) {
      setError(failure.message);
      setStage('ready');
      return;
    }
    setStage('saved');
    setTimeout(() => router.replace('/'), 1200);
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.brand}>
          A<span className={styles.plus}>+</span> Toolkit
        </span>
        <h1 className={styles.title}>{t('resetPasswordTitle')}</h1>

        {stage === 'exchanging' && <p className={styles.note}>{t('callbackWorking')}</p>}

        {stage === 'failed' && <p className={styles.error}>{t('resetLinkFailed')}</p>}

        {stage === 'saved' && (
          <p className={styles.sent} role="status">
            {t('passwordSaved')}
          </p>
        )}

        {(stage === 'ready' || stage === 'saving') && (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className={styles.label}>
              {t('newPassword')}
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className={styles.label}>
              {t('confirmPassword')}
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            <Button type="submit" variant="primary" disabled={stage === 'saving'}>
              {stage === 'saving' ? t('sending') : t('savePassword')}
            </Button>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
