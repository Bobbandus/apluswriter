'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { relations } from '@aplus/fountain/relations';
import type { CharacterEntry, LocationEntry, SceneIndexEntry } from '@aplus/fountain/types';
import styles from './CastSheet.module.css';

type View = 'characters' | 'locations' | 'relations';

export interface CastSheetProps {
  open: boolean;
  onClose: () => void;
  characters: CharacterEntry[];
  locations: LocationEntry[];
  scenes: SceneIndexEntry[];
  /** Put the caret at an offset in the script. */
  onReveal: (offset: number) => void;
  /** Rename a character everywhere: cues, extensions and CAST lines. */
  onRename: (from: string, to: string) => void;
  /** The script's own word list, for what the script does not spell out. */
  onOpenDictionary: () => void;
}

/**
 * Who is in the script and where it takes place.
 *
 * All of it is read straight off the parse, so it cannot disagree with the
 * script. The relationship map is drawn only when asked for — a picture nobody
 * requested is clutter on a screen people look at for eight hours.
 */
export function CastSheet({ open, onClose, characters, locations, scenes, onReveal, onRename, onOpenDictionary }: CastSheetProps) {
  const t = useTranslations('cast');
  const [view, setView] = useState<View>('characters');
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('title')}
      width={620}
      footer={
        <Button variant="ghost" onClick={onOpenDictionary}>
          {t('dictionary')}
        </Button>
      }
    >
      <SegmentedControl<View>
        label={t('title')}
        value={view}
        onChange={setView}
        fullWidth
        options={[
          { value: 'characters', label: t('characters') },
          { value: 'locations', label: t('locations') },
          { value: 'relations', label: t('relations') },
        ]}
      />

      <div className={styles.body}>
        {view === 'characters' &&
          (characters.length === 0 ? (
            <p className={styles.empty}>{t('noCharacters')}</p>
          ) : (
            <ul className={styles.list}>
              {characters.map((character) => (
                <li key={character.name} className={styles.row}>
                  {renaming === character.name ? (
                    <input
                      className={styles.input}
                      autoFocus
                      defaultValue={character.name}
                      aria-label={t('renameEverywhere')}
                      onBlur={() => setRenaming(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(null);
                        if (event.key !== 'Enter') return;
                        const next = event.currentTarget.value.trim().toLocaleUpperCase();
                        if (next && next !== character.name) onRename(character.name, next);
                        setRenaming(null);
                      }}
                    />
                  ) : (
                    <button type="button" className={styles.main} onClick={() => onReveal(character.firstAt)}>
                      <span className={styles.name}>{character.name}</span>
                      <span className={styles.facts}>
                        {t('characterFacts', { cues: character.cues, words: character.words, scenes: character.scenes.length })}
                      </span>
                    </button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(character.name)}>
                    {t('rename')}
                  </Button>
                </li>
              ))}
            </ul>
          ))}

        {view === 'locations' &&
          (locations.length === 0 ? (
            <p className={styles.empty}>{t('noLocations')}</p>
          ) : (
            <ul className={styles.list}>
              {locations.map((location) => {
                const first = scenes[location.scenes[0] ?? -1];
                return (
                  <li key={location.name} className={styles.row}>
                    <button type="button" className={styles.main} onClick={() => first && onReveal(first.from)}>
                      <span className={styles.name}>{location.name}</span>
                      <span className={styles.facts}>
                        {[location.prefixes.join(' / '), location.timesOfDay.join(' / '), t('sceneCount', { count: location.scenes.length })]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}

        {view === 'relations' && <RelationMap characters={characters} />}
      </div>
    </Sheet>
  );
}

/* ========================================================================== */

const SIZE = 420;
const CENTRE = SIZE / 2;
const RING = 150;

/**
 * The characters on a ring, joined by a line as thick as the scenes they share.
 *
 * A ring rather than a force layout: it is deterministic, so the picture does
 * not shuffle every time the script changes, and for the dozen or so people
 * who carry a script it reads at a glance.
 */
function RelationMap({ characters }: { characters: CharacterEntry[] }) {
  const t = useTranslations('cast');
  const { nodes, edges, omitted } = useMemo(() => relations(characters), [characters]);
  const [hover, setHover] = useState<string | null>(null);

  if (nodes.length < 2) return <p className={styles.empty}>{t('needTwo')}</p>;

  const maxWords = Math.max(...nodes.map((node) => node.words), 1);
  const maxShared = Math.max(...edges.map((edge) => edge.scenes), 1);

  const at = new Map(
    nodes.map((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [node.name, { x: CENTRE + Math.cos(angle) * RING, y: CENTRE + Math.sin(angle) * RING, angle }] as const;
    }),
  );

  return (
    <figure className={styles.map}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={t('relations')}>
        {edges.map((edge) => {
          const from = at.get(edge.a);
          const to = at.get(edge.b);
          if (!from || !to) return null;
          const lit = hover === null || hover === edge.a || hover === edge.b;
          return (
            <line
              key={`${edge.a}|${edge.b}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className={styles.edge}
              strokeWidth={1 + (edge.scenes / maxShared) * 5}
              opacity={lit ? 0.75 : 0.08}
            >
              <title>{`${edge.a} – ${edge.b}: ${t('sceneCount', { count: edge.scenes })}`}</title>
            </line>
          );
        })}

        {nodes.map((node) => {
          const place = at.get(node.name);
          if (!place) return null;
          const radius = 7 + Math.sqrt(node.words / maxWords) * 15;
          const right = Math.cos(place.angle) >= 0;
          return (
            <g
              key={node.name}
              className={styles.node}
              onMouseEnter={() => setHover(node.name)}
              onMouseLeave={() => setHover(null)}
            >
              <circle cx={place.x} cy={place.y} r={radius} />
              <text
                x={place.x + Math.cos(place.angle) * (radius + 6)}
                y={place.y + Math.sin(place.angle) * (radius + 6)}
                textAnchor={right ? 'start' : 'end'}
                dominantBaseline="middle"
              >
                {node.name}
              </text>
              <title>{t('nodeFacts', { cues: node.cues, words: node.words })}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className={styles.caption}>
        {t('mapCaption')}
        {omitted > 0 && ` ${t('omitted', { count: omitted })}`}
      </figcaption>
    </figure>
  );
}
