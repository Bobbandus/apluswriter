'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import { desktopApi, isDesktop } from '@/lib/platform';
import styles from './DownloadButton.module.css';

/**
 * The download itself — and the two honest answers to "should you?".
 *
 * Inside the desktop app there is nothing to download, so it says which
 * version is already running. On a Mac or a phone the installer is useless,
 * so it says that instead of handing over 107 MB of Windows binary. The page
 * around this is server-rendered; only this bit needs to know where it is.
 */
export function DownloadButton({ href, label }: { href: string; label: string }) {
  const t = useTranslations('download');
  const [where, setWhere] = useState<'unknown' | 'desktop' | 'windows' | 'other'>('unknown');
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (isDesktop()) {
      setWhere('desktop');
      void desktopApi()
        ?.appInfo?.()
        .then((info) => setVersion(info?.version || ''));
      return;
    }
    setWhere(/Win/i.test(navigator.platform || navigator.userAgent) ? 'windows' : 'other');
  }, []);

  if (where === 'desktop') {
    return <p className={styles.already}>{version ? t('alreadyVersion', { version }) : t('already')}</p>;
  }

  return (
    <>
      <a className={styles.button} href={href} download>
        <Icon name="download" size={18} />
        {label}
      </a>
      {where === 'other' && <p className={styles.note}>{t('windowsOnly')}</p>}
    </>
  );
}
