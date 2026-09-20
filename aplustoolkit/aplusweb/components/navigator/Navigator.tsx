'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import { EmptyState, Panel } from '@/components/ui/Panel';
import { SearchField } from '@/components/ui/SearchField';
import { outlineRows } from '@aplus/fountain/outline';
import type { SceneIndexEntry, SectionEntry } from '@aplus/fountain/types';
import { formatEighths } from '@aplus/paginator/paginate';
import styles from './Navigator.module.css';

export interface NavigatorProps {
  scenes: SceneIndexEntry[];
  /** Acts and sequences, from `# Akt I` and `## Sekvens A`. */
  sections?: SectionEntry[];
  /** Offset of the caret, used to mark the scene being written. */
  caret?: number;
  /** Scene lengths in eighths of a page, indexed like `scenes`. */
  eighths?: number[];
  onSelectScene?: (scene: SceneIndexEntry) => void;
  onSelectSection?: (section: SectionEntry) => void;
}

/**
 * The scene navigator.
 *
 * Structure comes from the script itself — a scene exists because a scene
 * heading was typed, and an act because someone typed `# Akt II`, not because
 * anything was added to an outline. There is no second document that can fall
 * out of sync with the text.
 *
 * Filtering flattens the list to matching scenes: an act heading above a
 * result the writer searched for is noise, not context.
 */
export function Navigator({ scenes, sections = [], caret, eighths, onSelectScene, onSelectSection }: NavigatorProps) {
  const t = useTranslations('navigator');
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set<number>());

  const needle = filter.trim().toLowerCase();

  const rows = useMemo(() => {
    if (!needle) return outlineRows(scenes, sections, collapsed);
    return outlineRows(scenes, [], new Set<number>()).filter(
      (row) =>
        row.kind === 'scene' &&
        (row.scene.heading.toLowerCase().includes(needle) ||
          (row.scene.synopsis ?? '').toLowerCase().includes(needle) ||
          row.scene.speaking.some((name) => name.toLowerCase().includes(needle))),
    );
  }, [scenes, sections, collapsed, needle]);

  const toggle = (index: number) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const currentId =
    caret === undefined
      ? null
      : (scenes.find((scene) => caret >= scene.from && caret < scene.to)?.id ?? null);

  return (
    <Panel
      title={t('title')}
      footer={<SearchField value={filter} onValueChange={setFilter} placeholder={t('filter')} />}
    >
      {scenes.length === 0 && sections.length === 0 ? (
        <EmptyState icon="elScene" title={t('noScenes')} hint={t('noScenesHint')} />
      ) : (
        <>
          <ul className={styles.list}>
            {rows.map((row) =>
              row.kind === 'section' ? (
                <li key={`section-${row.index}`} className={styles.section} style={indent(row.depth - 1)}>
                  <button
                    type="button"
                    className={styles.fold}
                    aria-expanded={!row.collapsed}
                    aria-label={t(row.collapsed ? 'expandSection' : 'collapseSection', { title: row.title })}
                    onClick={() => toggle(row.index)}
                  >
                    <Icon name={row.collapsed ? 'chevronRight' : 'chevronDown'} size={12} />
                  </button>
                  <button type="button" className={styles.sectionTitle} onClick={() => onSelectSection?.(sections[row.index] as SectionEntry)}>
                    {row.title}
                  </button>
                  {row.collapsed && <span className={styles.folded}>{row.sceneCount}</span>}
                </li>
              ) : (
                <li key={row.scene.id}>
                  <button
                    type="button"
                    className={styles.scene}
                    style={indent(needle ? 0 : row.indent)}
                    aria-current={row.scene.id === currentId}
                    onClick={() => onSelectScene?.(row.scene)}
                  >
                    <span className={styles.number}>{row.scene.sceneNumber ?? row.index + 1}</span>
                    <span className={styles.body}>
                      <span className={styles.heading}>{row.scene.heading}</span>
                      {row.scene.synopsis && <span className={styles.synopsis}>{row.scene.synopsis}</span>}
                    </span>
                    {eighths?.[row.index] ? <span className={styles.length}>{formatEighths(eighths[row.index] ?? 0)}</span> : null}
                    {row.scene.meta.color && row.scene.meta.color !== 'none' && (
                      <span
                        className={styles.dot}
                        style={{ ['--dot' as string]: `var(--scene-${row.scene.meta.color})` }}
                        aria-label={row.scene.meta.color}
                      />
                    )}
                  </button>
                </li>
              ),
            )}
          </ul>
          <p className={styles.count}>{t('sceneCount', { count: scenes.length })}</p>
        </>
      )}
    </Panel>
  );
}

/** One step per section level, as a custom property so the CSS decides how far a step is. */
function indent(levels: number): CSSProperties {
  return { ['--indent' as string]: levels };
}
