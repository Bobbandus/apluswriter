'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { EmptyState, Panel } from '@/components/ui/Panel';
import { estimateMinutes } from '@aplus/paginator/geometry';
import type { ScriptSummary } from '@aplus/fountain/worker';
import type { SceneIndexEntry } from '@aplus/fountain/types';
import type { ReactNode } from 'react';
import styles from './Inspector.module.css';

export interface InspectorProps {
  onOpenSettings: () => void;
  scene?: SceneIndexEntry | undefined;
  script: ScriptSummary;
  /** Extra sections for the scene, such as its shotlist. */
  extra?: ReactNode;
}

/**
 * The right-hand inspector.
 *
 * Shows what is selected: a scene's cast, location note, colour, status and
 * tags. With nothing selected it falls back to the shape of the whole script,
 * which is the number a writer actually wants at a glance.
 */
export function Inspector({ onOpenSettings, scene, script, extra }: InspectorProps) {
  const t = useTranslations('common');
  const tSettings = useTranslations('settings');
  const tNav = useTranslations('navigator');
  const tChars = useTranslations('characters');
  const tLocs = useTranslations('locations');

  const settingsButton = (
    <Tooltip label={tSettings('title')} shortcut="mod+," placement="left">
      <Button variant="ghost" size="sm" icon="settings" aria-label={tSettings('title')} onClick={onOpenSettings} />
    </Tooltip>
  );

  if (!scene) {
    return (
      <Panel title={t('scene')} actions={settingsButton}>
        <EmptyState icon="elScene" title={tNav('noScenes')} hint={tNav('noScenesHint')} />
      </Panel>
    );
  }

  return (
    <Panel title={t('scene')} actions={settingsButton}>
      <div className={styles.body}>
        <h3 className={styles.heading}>{scene.heading}</h3>

        {/* The whole script in one quiet line. One page is about a minute, so the
            runtime is an estimate, from the real page count the PDF uses too. */}
        <p className={styles.summary}>
          {[
            tNav('sceneCount', { count: script.scenes.length }),
            `${script.characters.length} ${tChars('title').toLowerCase()}`,
            `${script.locations.length} ${tLocs('title').toLowerCase()}`,
            script.layout ? `${script.layout.pageCount} s · ≈ ${estimateMinutes(script.layout.pageCount)} min` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {scene.speaking.length > 0 && (
          <section className={styles.section}>
            <p className={styles.label}>{tChars('title')}</p>
            <ul className={styles.chips}>
              {scene.speaking.map((name) => (
                <li key={name} className={styles.chip}>
                  {name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {scene.meta.cast && scene.meta.cast.length > 0 && (
          <section className={styles.section}>
            <p className={styles.label}>CAST</p>
            <ul className={styles.chips}>
              {scene.meta.cast.map((name) => (
                <li key={name} className={styles.chip}>
                  {name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {scene.meta.tags && scene.meta.tags.length > 0 && (
          <section className={styles.section}>
            <p className={styles.label}>{tNav('title')}</p>
            <ul className={styles.chips}>
              {scene.meta.tags.map((tag) => (
                <li key={`${tag.kind}:${tag.value}`} className={styles.tag}>
                  <span className={styles.tagKind}>{tag.kind}</span>
                  {tag.value}
                </li>
              ))}
            </ul>
          </section>
        )}

        {scene.meta.locationNote && (
          <section className={styles.section}>
            <p className={styles.label}>{tLocs('title')}</p>
            <p className={styles.note}>{scene.meta.locationNote}</p>
          </section>
        )}

        {extra}
      </div>
    </Panel>
  );
}
