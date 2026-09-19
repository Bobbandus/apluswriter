'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, Panel } from '@/components/ui/Panel';
import { SearchField } from '@/components/ui/SearchField';
import type { SceneIndexEntry } from '@aplus/fountain/types';
import { formatEighths } from '@aplus/paginator/paginate';
import styles from './Navigator.module.css';

export interface NavigatorProps {
  scenes: SceneIndexEntry[];
  /** Offset of the caret, used to mark the scene being written. */
  caret?: number;
  /** Scene lengths in eighths of a page, indexed like `scenes`. */
  eighths?: number[];
  onSelectScene?: (scene: SceneIndexEntry) => void;
}

/**
 * The scene navigator.
 *
 * Structure comes from the script itself — a scene exists because a scene
 * heading was typed, not because anything was added to an outline. There is no
 * second document that can fall out of sync with the text.
 */
export function Navigator({ scenes, caret, eighths, onSelectScene }: NavigatorProps) {
  const t = useTranslations('navigator');
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return scenes;
    return scenes.filter(
      (scene) =>
        scene.heading.toLowerCase().includes(needle) ||
        (scene.synopsis ?? '').toLowerCase().includes(needle) ||
        scene.speaking.some((name) => name.toLowerCase().includes(needle)),
    );
  }, [scenes, filter]);

  const currentId =
    caret === undefined
      ? null
      : (scenes.find((scene) => caret >= scene.from && caret < scene.to)?.id ?? null);

  return (
    <Panel
      title={t('title')}
      footer={<SearchField value={filter} onValueChange={setFilter} placeholder={t('filter')} />}
    >
      {scenes.length === 0 ? (
        <EmptyState icon="elScene" title={t('noScenes')} hint={t('noScenesHint')} />
      ) : (
        <>
          <ul className={styles.list}>
            {visible.map((scene, index) => (
              <li key={scene.id}>
                <button
                  type="button"
                  className={styles.scene}
                  aria-current={scene.id === currentId}
                  onClick={() => onSelectScene?.(scene)}
                >
                  <span className={styles.number}>{scene.sceneNumber ?? index + 1}</span>
                  <span className={styles.body}>
                    <span className={styles.heading}>{scene.heading}</span>
                    {scene.synopsis && <span className={styles.synopsis}>{scene.synopsis}</span>}
                  </span>
                  {eighths?.[scenes.indexOf(scene)] ? (
                    <span className={styles.length}>{formatEighths(eighths[scenes.indexOf(scene)] ?? 0)}</span>
                  ) : null}
                  {scene.meta.color && scene.meta.color !== 'none' && (
                    <span
                      className={styles.dot}
                      style={{ ['--dot' as string]: `var(--scene-${scene.meta.color})` }}
                      aria-label={scene.meta.color}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className={styles.count}>{t('sceneCount', { count: scenes.length })}</p>
        </>
      )}
    </Panel>
  );
}
