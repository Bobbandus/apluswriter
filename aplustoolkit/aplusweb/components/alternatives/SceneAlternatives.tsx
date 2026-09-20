'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import type { Alternative } from '@aplus/fountain/alternatives';
import styles from './SceneAlternatives.module.css';

export interface SceneAlternativesProps {
  alternatives: Alternative[];
  onSave: (label: string) => void;
  onSwap: (index: number) => void;
  onRemove: (index: number) => void;
}

/**
 * Other versions of the scene the caret is in.
 *
 * Quiet until used: one small button when there are none. The parked versions
 * live in the script as boneyard, so nothing here is a second copy to keep in
 * step; this is only a way to look at them and swap.
 */
export function SceneAlternatives({ alternatives, onSave, onSwap, onRemove }: SceneAlternativesProps) {
  const t = useTranslations('alternatives');
  const [naming, setNaming] = useState(false);

  return (
    <section className={styles.root}>
      <p className={styles.title}>{t('title')}</p>

      {alternatives.length > 0 && (
        <ul className={styles.list}>
          {alternatives.map((alt, index) => (
            <li key={`${index}:${alt.label}`} className={styles.row}>
              <span className={styles.label}>{alt.label || t('unnamed')}</span>
              <Button size="sm" variant="secondary" onClick={() => onSwap(index)}>
                {t('swapIn')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="close"
                aria-label={t('remove', { name: alt.label || t('unnamed') })}
                onClick={() => onRemove(index)}
              />
            </li>
          ))}
        </ul>
      )}

      {naming ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem('label') as HTMLInputElement;
            onSave(input.value.trim() || t('unnamed'));
            setNaming(false);
          }}
        >
          <input
            name="label"
            className={styles.input}
            autoFocus
            placeholder={t('namePlaceholder')}
            onBlur={(event) => {
              if (!event.currentTarget.value) setNaming(false);
            }}
          />
          <Button type="submit" size="sm" variant="primary">
            {t('save')}
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setNaming(true)}>
          {t('keepThisVersion')}
        </Button>
      )}
      <p className={styles.hint}>{t('hint')}</p>
    </section>
  );
}
