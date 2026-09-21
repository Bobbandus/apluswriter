'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import { desktopApi } from '@/lib/platform';
import styles from './UpdatePill.module.css';

/**
 * One line, once, when a new version has finished downloading.
 *
 * Updates arrive silently and install themselves when the app is next closed,
 * which is right — nobody should be pulled out of a scene by a dialog. But
 * silent all the way through means a writer has no way of knowing the app
 * updates at all, and no way to take a fix today rather than tomorrow. So:
 * a line that says what happened and a button that acts on it. Ignoring it
 * costs nothing; the update is applied on the next close either way.
 */
export function UpdatePill() {
  const t = useTranslations('desktop');
  const [version, setVersion] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;

    // One that arrived before this mounted, and any that arrive after.
    void api.appInfo?.().then((info) => {
      if (info?.updateReady) setVersion(info.updateVersion || '');
    });
    return api.onUpdateReady?.((info) => setVersion(info?.version || ''));
  }, []);

  if (version === null) return null;

  return (
    <aside className={styles.pill}>
      <Icon name="download" size={16} />
      <span className={styles.text}>
        <strong>{version ? t('updateReady', { version }) : t('updateReadyPlain')}</strong> {t('updateWhen')}
      </span>
      <button
        type="button"
        className={styles.restart}
        disabled={restarting}
        onClick={() => {
          setRestarting(true);
          void desktopApi()?.restartToUpdate?.();
        }}
      >
        {t('updateRestart')}
      </button>
    </aside>
  );
}
