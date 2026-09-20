'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import { Menu } from '@/components/ui/Menu';
import { signOut, useSession } from '@/lib/storage/hooks';
import styles from './AccountButton.module.css';

/**
 * The account control in every page header.
 *
 * Renders nothing until we know whether cloud sync exists at all and whether
 * there is a stored session. A writer who never set up Supabase never meets a
 * dead "Sign in" button, and nobody sees a signed-out flash before the session
 * has been read.
 */
export function AccountButton() {
  const t = useTranslations('auth');
  const session = useSession();

  if (!session.configured || !session.ready) return null;

  if (!session.email) {
    return (
      <Link href="/login" className={styles.button}>
        <Icon name="user" size={15} />
        {t('signIn')}
      </Link>
    );
  }

  return (
    <Menu
      items={[{ label: t('signOut'), icon: 'user', onSelect: () => void signOut() }]}
      trigger={(props) => (
        <button
          type="button"
          className={styles.button}
          aria-label={t('signedInAs', { email: session.email ?? '' })}
          {...props}
        >
          <Icon name="user" size={15} />
          <span className={styles.email}>{session.email}</span>
        </button>
      )}
    />
  );
}
