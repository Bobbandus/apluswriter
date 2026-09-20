'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import type { Shotlist } from '@aplus/bridge/protocol';
import styles from './ShotlistBlock.module.css';

export interface ShotlistBlockProps {
  shotlist: Shotlist;
  onRemove: () => void;
}

/** A scene's saved shotlist, compact enough to sit in the inspector. */
export function ShotlistBlock({ shotlist, onRemove }: ShotlistBlockProps) {
  const t = useTranslations('assistant');

  return (
    <section className={styles.block}>
      <div className={styles.head}>
        <p className={styles.label}>{t('shotlist')}</p>
        <Button variant="ghost" size="sm" icon="trash" aria-label={t('remove')} onClick={onRemove} />
      </div>

      {shotlist.approach && <p className={styles.approach}>{shotlist.approach}</p>}

      <ol className={styles.list}>
        {shotlist.shots.map((shot) => (
          <li key={shot.number} className={styles.shot}>
            <span className={styles.number}>{shot.number}</span>
            <span className={styles.body}>
              <span className={styles.specs}>
                {[shot.size, shot.lens ? `${shot.lens} mm` : null, shot.angle, shot.movement, shot.camera, shot.follow ? `→ ${shot.follow}` : null, shot.path, shot.speed]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {shot.description}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
