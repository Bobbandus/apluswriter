'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { isDesktop } from '@/lib/platform';
import styles from './DesktopDownloadBanner.module.css';

/**
 * The installer is published under a name without a version, so this link is
 * the same one forever. See .github/workflows/release.yml.
 */
const DOWNLOAD = 'https://github.com/Bobbandus/apluswriter/releases/latest/download/A-Plus-Toolkit-Setup.exe';

/**
 * A quiet offer of the desktop app, in the browser only.
 *
 * Three things keep it from becoming the kind of banner people learn to
 * ignore: it never appears inside the desktop app itself, it only appears on
 * Windows — which is the only installer there is — and dismissing it is
 * remembered. It is a line of text, not a box.
 */
export function DesktopDownloadBanner() {
  const t = useTranslations('desktop');
  const [dismissed, setDismissed] = usePersistentState('aplus.ui.desktopBanner.dismissed', false);

  // Rendering on the server and hiding on hydration would flash the banner
  // inside the desktop app, which is the one place it must never show.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready || dismissed || isDesktop()) return null;
  if (!/Win/i.test(navigator.platform || navigator.userAgent)) return null;

  return (
    <aside className={styles.banner}>
      <Icon name="device" size={16} />
      <span className={styles.text}>
        <strong>{t('bannerTitle')}</strong> {t('bannerBody')}
      </span>
      <a className={styles.download} href={DOWNLOAD}>
        {t('bannerDownload')}
      </a>
      <button type="button" className={styles.dismiss} onClick={() => setDismissed(true)} aria-label={t('bannerDismiss')}>
        <Icon name="close" size={14} />
      </button>
    </aside>
  );
}
