'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GEAR_CATEGORIES, addGear, gearNeeds, hasLens, removeGear, togglePacked, updateGear, type GearCategory, type Rig } from '@aplus/shoot/set';
import type { ShootProject } from './useShootProject';
import styles from './Shoot.module.css';

/** What a rig needs to be on the list to count as brought: the word for it in the kit's name. */
const RIG_IN_KIT: Record<Rig, RegExp> = {
  tripod: /stativ|tripod|sticks/i,
  dolly: /dolly|räls|track/i,
  slider: /slider/i,
  gimbal: /gimbal|ronin|steadicam|crane\s?\d|rs\s?\d/i,
  handheld: /axel|shoulder|rig|cage/i,
  crane: /kran|crane|jib/i,
  drone: /drönare|drone|dji|mavic|fpv/i,
};

/** A small crew's kit, to start a list from rather than type it all. */
const STARTER: { category: GearCategory; key: string; qty?: number }[] = [
  { category: 'camera', key: 'camera' },
  { category: 'camera', key: 'batteries', qty: 4 },
  { category: 'camera', key: 'cards', qty: 4 },
  { category: 'camera', key: 'monitor' },
  { category: 'grip', key: 'tripod' },
  { category: 'grip', key: 'sandbags', qty: 4 },
  { category: 'light', key: 'keyLight' },
  { category: 'light', key: 'stands', qty: 3 },
  { category: 'sound', key: 'boom' },
  { category: 'sound', key: 'lav', qty: 2 },
  { category: 'sound', key: 'recorder' },
  { category: 'power', key: 'extension', qty: 3 },
  { category: 'other', key: 'slate' },
  { category: 'other', key: 'tape' },
];

/**
 * Gear: what the day's shots call for, read off the shotlist, against the kit
 * you have; and a packing list for the day, ticked off at the van.
 */
export function GearView({ p }: { p: ShootProject }) {
  const t = useTranslations('shoot.set');
  const dayKey = p.day?.id ?? 'all';
  const packed = new Set(p.shoot.packed[dayKey] ?? []);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GearCategory>('camera');
  const [qty, setQty] = useState(1);

  const shots = useMemo(() => p.scenes.flatMap((i) => p.lists.get(i)?.shots ?? []), [p.scenes, p.lists]);
  const needs = useMemo(() => gearNeeds(shots), [shots]);
  const gear = p.shoot.gear;

  const add = () => {
    if (!name.trim()) return;
    p.update((d) => addGear(d, { name: name.trim(), category, qty: Math.max(1, qty) }));
    setName('');
    setQty(1);
  };

  const addStarter = () =>
    p.update((d) => STARTER.reduce((acc, item) => addGear(acc, { name: t(`starter.${item.key}`), category: item.category, qty: item.qty ?? 1 }), d));

  return (
    <div className={styles.narrow}>
      <section className={styles.section}>
        <p className={styles.heading}>{t('gearNeeded')}</p>
        <h1 className={styles.title} style={{ marginBottom: 'var(--s-3)' }}>
          {p.day ? t('forDay', { n: p.day.number }) : t('forAll')}
        </h1>
        {shots.length === 0 ? (
          <p className={`${styles.card} ${styles.muted}`}>{t('gearNoShots')}</p>
        ) : (
          <div className={styles.card}>
            <p className={styles.faint} style={{ marginBottom: 'var(--s-2)' }}>
              {t('lenses')}
            </p>
            <div className={styles.needs} style={{ marginBottom: 'var(--s-4)' }}>
              {needs.lenses.length === 0 && <span className={styles.muted}>{t('noLenses')}</span>}
              {needs.lenses.map((mm) => {
                const ok = gear.length ? hasLens(gear, mm) : undefined;
                return (
                  <span key={mm} className={styles.need} data-ok={ok}>
                    {mm} mm {ok === true ? '✓' : ok === false ? '?' : ''}
                  </span>
                );
              })}
            </div>
            <p className={styles.faint} style={{ marginBottom: 'var(--s-2)' }}>
              {t('rigs')}
            </p>
            <div className={styles.needs}>
              {needs.rigs.length === 0 && <span className={styles.muted}>{t('noRigs')}</span>}
              {needs.rigs.map((rig) => {
                const ok = gear.length ? gear.some((g) => RIG_IN_KIT[rig].test(g.name)) : undefined;
                return (
                  <span key={rig} className={styles.need} data-ok={ok}>
                    {t(`rig.${rig}`)} {ok === true ? '✓' : ok === false ? '?' : ''}
                  </span>
                );
              })}
            </div>
            {gear.length > 0 && <p className={styles.faint} style={{ marginTop: 'var(--s-3)' }}>{t('needsHint')}</p>}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.heading}>{t('packing')}</p>
            <h2 className={styles.title}>{t('packedCount', { done: gear.filter((g) => packed.has(g.id)).length, total: gear.length })}</h2>
          </div>
          {gear.length > 0 && (
            <button type="button" className={styles.ghost} onClick={() => p.update((d) => ({ ...d, packed: { ...d.packed, [dayKey]: [] } }))}>
              {t('unpackAll')}
            </button>
          )}
        </div>

        <div className={`${styles.card} ${styles.row}`} style={{ marginBottom: 'var(--s-3)' }}>
          <input
            className={`${styles.input} ${styles.grow}`}
            style={{ flexBasis: 200 }}
            value={name}
            placeholder={t('gearName')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <select className={styles.select} style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value as GearCategory)} aria-label={t('category')}>
            {GEAR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
          <input className={styles.input} style={{ width: 72 }} type="number" min={1} inputMode="numeric" value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} aria-label={t('qty')} />
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={add} disabled={!name.trim()}>
            {t('add')}
          </button>
        </div>

        {gear.length === 0 ? (
          <div className={`${styles.card} ${styles.muted}`}>
            <p style={{ marginBottom: 'var(--s-3)' }}>{t('noGear')}</p>
            <button type="button" className={styles.button} onClick={addStarter}>
              {t('addStarter')}
            </button>
          </div>
        ) : (
          GEAR_CATEGORIES.filter((c) => gear.some((g) => g.category === c)).map((c) => (
            <div key={c} className={styles.card} style={{ marginBottom: 'var(--s-3)', padding: 'var(--s-2)' }}>
              <p className={styles.heading} style={{ padding: 'var(--s-2) var(--s-3)' }}>
                {t(`categories.${c}`)}
              </p>
              {gear
                .filter((g) => g.category === c)
                .map((g) => (
                  <div key={g.id} className={styles.gearItem}>
                    <input type="checkbox" className={styles.check} checked={packed.has(g.id)} onChange={() => p.update((d) => togglePacked(d, dayKey, g.id))} aria-label={t('packedLabel', { name: g.name })} />
                    <input className={styles.input} value={g.name} onChange={(e) => p.update((d) => updateGear(d, g.id, { name: e.target.value }))} aria-label={t('gearName')} />
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={g.qty}
                      onChange={(e) => p.update((d) => updateGear(d, g.id, { qty: Number(e.target.value) || 1 }))}
                      aria-label={t('qty')}
                    />
                    <button type="button" className={styles.ghost} onClick={() => window.confirm(t('deleteGear', { name: g.name })) && p.update((d) => removeGear(d, g.id))} aria-label={t('delete')}>
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
