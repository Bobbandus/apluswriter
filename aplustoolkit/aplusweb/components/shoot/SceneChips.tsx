'use client';

import type { SceneIndexEntry } from '@aplus/fountain/types';
import { lightOf, settingOf } from '@aplus/production/stripboard';
import styles from './Shoot.module.css';

/** INT/EXT and DAY/NIGHT as two small tags, the way a strip shows them. */
export function SceneChips({ scene, dayLabel, nightLabel }: { scene: SceneIndexEntry; dayLabel: string; nightLabel: string }) {
  const setting = settingOf(scene);
  const light = lightOf(scene);
  return (
    <span className={styles.row}>
      {setting && (
        <span className={styles.chip} data-tone={setting === 'EXT' ? 'ext' : undefined}>
          {setting}
        </span>
      )}
      {light && (
        <span className={styles.chip} data-tone={light === 'night' ? 'night' : undefined}>
          {light === 'night' ? nightLabel : dayLabel}
        </span>
      )}
    </span>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const share = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <span style={{ width: `${share}%` }} />
    </div>
  );
}
