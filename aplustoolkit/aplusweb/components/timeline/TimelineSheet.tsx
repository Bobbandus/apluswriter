'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { energyPaths, timeline } from '@aplus/fountain/timeline';
import type { SceneIndexEntry } from '@aplus/fountain/types';
import styles from './TimelineSheet.module.css';

export interface TimelineSheetProps {
  open: boolean;
  onClose: () => void;
  scenes: SceneIndexEntry[];
  /** Sets, or with null removes, a scene's day or energy in the text. */
  onSet: (sceneIndex: number, field: 'day' | 'energy', value: number | null) => void;
}

const WIDTH = 600;
const HEIGHT = 84;
const PAD = 10;

/**
 * Story days and energy, per scene, as small number fields. Both live in the
 * script as notes under the scene heading (`[[day: 3]]`, `[[energy: 7]]`), so
 * this is only a quieter way of writing them: nothing here is stored anywhere
 * else, and deleting the note in the text clears the field.
 */
export function TimelineSheet({ open, onClose, scenes, onSet }: TimelineSheetProps) {
  const t = useTranslations('timeline');
  const data = useMemo(() => timeline(scenes), [scenes]);
  const paths = useMemo(() => energyPaths(data.rows), [data.rows]);

  const point = (p: { x: number; y: number }) => `${PAD + p.x * (WIDTH - 2 * PAD)},${HEIGHT - PAD - p.y * (HEIGHT - 2 * PAD)}`;

  /** A number in the field, or blank to clear. Anything else is put back by the redraw. */
  const commit = (index: number, field: 'day' | 'energy', raw: string) => {
    const text = raw.trim();
    if (text === '') return onSet(index, field, null);
    const value = Number(text);
    const max = field === 'energy' ? 10 : 9999;
    if (Number.isInteger(value) && value >= 1 && value <= max) onSet(index, field, value);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('title')} width={640}>
      <div className={styles.body}>
        <p className={styles.hint}>{t('hint')}</p>

        {paths.length > 0 && (
          <svg className={styles.curve} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('curve')} preserveAspectRatio="none">
            {paths.map((path, i) =>
              path.length > 1 ? <polyline key={i} className={styles.line} points={path.map(point).join(' ')} /> : null,
            )}
            {paths.flat().map((p, i) => {
              const [x, y] = point(p).split(',');
              return <circle key={i} className={styles.dot} cx={x} cy={y} r={3} />;
            })}
          </svg>
        )}

        {data.warnings.length > 0 && (
          <ul className={styles.warnings}>
            {data.warnings.map((warning) => (
              <li key={warning.index}>
                {t('backwards', {
                  scene: warning.index + 1,
                  day: warning.day,
                  after: warning.after,
                })}
              </li>
            ))}
          </ul>
        )}

        <div className={styles.table}>
          <span className={styles.head}>{t('scene')}</span>
          <span className={styles.head}>{t('day')}</span>
          <span className={styles.head}>{t('energy')}</span>

          {data.rows.map((row) => (
            <Row
              key={row.index}
              label={`${row.index + 1}  ${row.heading}`}
              day={row.day}
              inheritedDay={row.effectiveDay}
              energy={row.energy}
              dayLabel={t('dayFor', { scene: row.index + 1 })}
              energyLabel={t('energyFor', { scene: row.index + 1 })}
              onDay={(raw) => commit(row.index, 'day', raw)}
              onEnergy={(raw) => commit(row.index, 'energy', raw)}
            />
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function Row(props: {
  label: string;
  day: number | null;
  inheritedDay: number | null;
  energy: number | null;
  dayLabel: string;
  energyLabel: string;
  onDay: (raw: string) => void;
  onEnergy: (raw: string) => void;
}) {
  return (
    <>
      <span className={`${styles.scene} ${props.day === null ? styles.inherited : ''}`}>{props.label}</span>
      {/* Uncontrolled and keyed on the value in the text: typing is free, and the field
          redraws from the script once the note has changed. */}
      <input
        key={`d${props.day}`}
        className={styles.input}
        inputMode="numeric"
        defaultValue={props.day ?? ''}
        placeholder={props.inheritedDay === null ? '' : String(props.inheritedDay)}
        aria-label={props.dayLabel}
        onBlur={(event) => props.onDay(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      />
      <input
        key={`e${props.energy}`}
        className={styles.input}
        inputMode="numeric"
        defaultValue={props.energy ?? ''}
        aria-label={props.energyLabel}
        onBlur={(event) => props.onEnergy(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      />
    </>
  );
}
