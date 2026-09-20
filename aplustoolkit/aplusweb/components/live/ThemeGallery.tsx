'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { defaultState } from '@aplus/live/board';
import { defaultHandball } from '@aplus/live/handball';
import { DEFAULT_THEMES, themesFor } from '@aplus/live/theme';
import { BOARD_KINDS, type BoardKind, type BoardState } from '@aplus/live/types';
import { BoardView } from './BoardView';
import { Canvas } from './Canvas';
import styles from './ThemeGallery.module.css';

/** A board with something on it, so a theme is judged on what it looks like in use and not empty. */
function sample(kind: BoardKind): BoardState {
  const side = (name: string, extra: Record<string, unknown> = {}) => ({ name, color: '', logo: '', flag: '', ...extra });
  switch (kind) {
    case 'score':
      return { a: side('Lag Ett', { score: 3 }), b: side('Lag Två', { score: 2 }), label: 'Semifinal', clock: '12:40' } as unknown as BoardState;
    case 'pingis':
      return {
        ...(defaultState('pingis') as object),
        a: { ...side('Truls Moregard', { flag: 'SE' }), points: 7, sets: 2 },
        b: { ...side('Timo Boll', { flag: 'DE' }), points: 2, sets: 3 },
        server: 'b',
        firstServer: 'b',
        label: 'Final',
      } as unknown as BoardState;
    case 'handball':
      return {
        ...defaultHandball(),
        a: side('Lag Ett', { score: 14 }),
        b: side('Lag Två', { score: 12 }),
        timer: { base: 23 * 60 * 1000 + 41_000, since: null },
        penalties: { a: [23 * 60 * 1000 + 41_000 + 74_000], b: [] },
      } as unknown as BoardState;
    case 'ranking':
      return {
        title: 'Juryns poäng',
        entries: [
          { name: 'Artist A', points: 42, color: '' },
          { name: 'Artist B', points: 58, color: '' },
          { name: 'Artist C', points: 35, color: '' },
          { name: 'Artist D', points: 58, color: '' },
        ],
        highlight: 1,
      } as unknown as BoardState;
    default:
      return { items: [{ title: 'Joshua Noal', subtitle: 'Reporter · Studio A' }], index: 0, visible: true } as unknown as BoardState;
  }
}

/** How much bigger than life a design is drawn in a small preview, so its details can be judged. Full-width designs ignore it. */
function galleryScale(kind: BoardKind, design: string): number {
  if (kind === 'lower') return 1.9;
  if (kind === 'ranking') return 1.3;
  const bySize: Record<string, number> = { broadcast: 2.6, college: 2.2, stack: 2.4, league: 1.7, pill: 1.7 };
  return bySize[design] ?? 1;
}

/** Every built-in theme for a kind of board, drawn on that kind of board. */
export function ThemeGallery() {
  const t = useTranslations('live');
  const [kind, setKind] = useState<BoardKind>('score');
  const themes = useMemo(() => themesFor(kind), [kind]);
  const state = useMemo(() => sample(kind), [kind]);

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <label>
          {t('owner.kind')}{' '}
          <select className={styles.field} value={kind} onChange={(event) => setKind(event.target.value as BoardKind)}>
            {BOARD_KINDS.map((option) => (
              <option key={option} value={option}>
                {t(`owner.kinds.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.count}>{t('gallery.count', { count: themes.length, total: DEFAULT_THEMES.length })}</span>
      </div>
      <div className={styles.grid}>
        {themes.map((theme) => (
          <figure key={theme.name} className={styles.card}>
            <div className={styles.preview}>
              <Canvas>
                <BoardView kind={kind} state={state} theme={theme} position="cc" scale={galleryScale(kind, theme.design)} />
              </Canvas>
            </div>
            <figcaption className={styles.name}>
              {theme.name}
              <span>{theme.design}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
