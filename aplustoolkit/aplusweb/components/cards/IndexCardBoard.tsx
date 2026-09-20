'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import { EmptyState } from '@/components/ui/Panel';
import type { SceneIndexEntry } from '@aplus/fountain/types';
import { formatEighths } from '@aplus/paginator/paginate';
import styles from './IndexCardBoard.module.css';

export interface IndexCardBoardProps {
  scenes: SceneIndexEntry[];
  /** Scene lengths in eighths of a page, indexed like `scenes`. */
  eighths?: number[] | undefined;
  /** Offset of the caret, so the card for the scene being written is marked. */
  caret?: number;
  /** Move card `from` to position `to`. The board never edits the text itself. */
  onMove: (from: number, to: number) => void;
  /** Open a scene in the script. */
  onOpen: (scene: SceneIndexEntry) => void;
  /** Write a scene's synopsis. An empty string is ignored, not a delete. */
  onSynopsis: (scene: SceneIndexEntry, text: string, index: number) => void;
}

/**
 * The scenes as a table of index cards.
 *
 * A view over the script, not a copy of it: dragging a card reports "move 3 to
 * 1" and the caller rewrites the Fountain. The cards then redraw from the new
 * text, so the board can never show an order the script does not have.
 *
 * Dragging is the fast way and not the only one — every card has move buttons,
 * because a reorder that needs a mouse is a reorder some writers cannot do.
 */
export function IndexCardBoard({ scenes, eighths, caret, onMove, onOpen, onSynopsis }: IndexCardBoardProps) {
  const t = useTranslations('cards');
  const tNav = useTranslations('navigator');

  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  if (scenes.length === 0) {
    return (
      <div className={styles.empty}>
        <EmptyState icon="cards" title={t('empty')} hint={t('emptyHint')} />
      </div>
    );
  }

  const finish = () => {
    setDragging(null);
    setOver(null);
  };

  const currentId = caret === undefined ? null : (scenes.find((s) => caret >= s.from && caret < s.to)?.id ?? null);

  return (
    <div className={styles.board}>
      <ul className={styles.grid}>
        {scenes.map((scene, index) => {
          const isEditing = editing === index;
          return (
            <li
              key={scene.id}
              className={styles.card}
              draggable={!isEditing}
              data-dragging={dragging === index || undefined}
              data-over={over === index && dragging !== null && dragging !== index ? (dragging < index ? 'after' : 'before') : undefined}
              data-current={scene.id === currentId || undefined}
              onDragStart={(event) => {
                setDragging(index);
                event.dataTransfer.effectAllowed = 'move';
                // Firefox refuses to start a drag that carries no data.
                event.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (over !== index) setOver(index);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) setOver((current) => (current === index ? null : current));
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null && dragging !== index) onMove(dragging, index);
                finish();
              }}
              onDragEnd={finish}
            >
              <header className={styles.head}>
                <span className={styles.grip} aria-hidden="true">
                  <Icon name="grip" size={14} />
                </span>
                <span className={styles.number}>{scene.sceneNumber ?? index + 1}</span>
                {scene.meta.color && scene.meta.color !== 'none' && (
                  <span
                    className={styles.dot}
                    style={{ ['--dot' as string]: `var(--scene-${scene.meta.color})` }}
                    aria-label={scene.meta.color}
                  />
                )}
                {eighths?.[index] ? <span className={styles.length}>{formatEighths(eighths[index] ?? 0)}</span> : null}
              </header>

              <button type="button" className={styles.heading} onClick={() => onOpen(scene)}>
                {scene.heading}
              </button>

              {isEditing ? (
                <textarea
                  className={styles.edit}
                  autoFocus
                  rows={3}
                  defaultValue={scene.synopsis ?? ''}
                  placeholder={t('synopsisPlaceholder')}
                  aria-label={t('synopsisPlaceholder')}
                  onBlur={(event) => {
                    const value = event.currentTarget.value.trim();
                    if (value && value !== (scene.synopsis ?? '')) onSynopsis(scene, value, index);
                    setEditing(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.currentTarget.value = scene.synopsis ?? '';
                      event.currentTarget.blur();
                    } else if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <button type="button" className={styles.synopsis} data-empty={!scene.synopsis || undefined} onClick={() => setEditing(index)}>
                  {scene.synopsis ?? t('addSynopsis')}
                </button>
              )}

              {scene.speaking.length > 0 && (
                <ul className={styles.cast}>
                  {scene.speaking.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}

              <footer className={styles.foot}>
                <button
                  type="button"
                  className={styles.move}
                  disabled={index === 0}
                  aria-label={t('moveUp', { heading: scene.heading })}
                  onClick={() => onMove(index, index - 1)}
                >
                  <Icon name="chevronUp" size={14} />
                </button>
                <button
                  type="button"
                  className={styles.move}
                  disabled={index === scenes.length - 1}
                  aria-label={t('moveDown', { heading: scene.heading })}
                  onClick={() => onMove(index, index + 1)}
                >
                  <Icon name="chevronDown" size={14} />
                </button>
              </footer>
            </li>
          );
        })}
      </ul>
      <p className={styles.count}>{tNav('sceneCount', { count: scenes.length })}</p>
    </div>
  );
}
