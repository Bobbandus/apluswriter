'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { LiveAction } from '@aplus/live/board';
import { clockText, elapsedMs, penaltiesLeft } from '@aplus/live/handball';
import type { HandballState, LowerState, PingisState, RankingState, ScoreState, Side } from '@aplus/live/types';
import { useNow } from '@/lib/live/useNow';
import { useLiveBoard, type LiveBoard, type LiveStatus } from '@/lib/live/useLiveBoard';
import { BoardView } from './BoardView';
import { Canvas } from './Canvas';
import styles from './ControlPanel.module.css';

/** The operator's page: the board as it looks on air, and the buttons that change it. */
export function ControlPanel({ token }: { token: string }) {
  const t = useTranslations('live');
  const { board, status, apply } = useLiveBoard(token);

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.head}>
          <h1 className={styles.title}>{board?.name ?? 'A+ Live'}</h1>
          <span className={styles.status} data-state={status}>
            {t(`status.${status}`)}
          </span>
        </div>

        {(status === 'missing' || status === 'notInstalled' || status === 'notConfigured') && !board && <p className={styles.notice}>{t(`notice.${status}`)}</p>}

        {board && !board.canControl && <p className={styles.notice}>{t('notice.viewOnly')}</p>}

        {board && (
          <>
            <div className={styles.preview}>
              <Canvas>
                <BoardView kind={board.kind} state={board.state} theme={board.theme} position="bl" winnerLabel={t('winner')} />
              </Canvas>
            </div>
            {board.canControl && <Controls board={board} apply={apply} />}
          </>
        )}
      </div>
    </div>
  );
}

function Controls({ board, apply }: { board: LiveBoard; apply: (action: LiveAction) => void }) {
  if (board.kind === 'score') return <ScoreControls state={board.state as ScoreState} apply={apply} />;
  if (board.kind === 'pingis') return <PingisControls state={board.state as PingisState} apply={apply} />;
  if (board.kind === 'handball') return <HandballControls state={board.state as HandballState} apply={apply} />;
  if (board.kind === 'ranking') return <RankingControls state={board.state as RankingState} apply={apply} />;
  return <LowerControls state={board.state as LowerState} apply={apply} />;
}

/** A text field that changes the board when it is left or Enter is pressed, not on every key. */
function CommitField({ value, onCommit, placeholder, className, label }: { value: string; onCommit: (value: string) => void; placeholder?: string | undefined; className: string | undefined; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
    />
  );
}

/** Keys that work anywhere on the page except while typing in a field. */
function useKeys(map: Record<string, () => void>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const action = map[event.key.toLowerCase()];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

/* ------------------------------------------------------------------ score */

function ScoreControls({ state, apply, textClock = true }: { state: ScoreState; apply: (action: LiveAction) => void; textClock?: boolean }) {
  const t = useTranslations('live.control');
  useKeys({
    q: () => apply({ type: 'add', side: 'a' }),
    a: () => apply({ type: 'sub', side: 'a' }),
    p: () => apply({ type: 'add', side: 'b' }),
    l: () => apply({ type: 'sub', side: 'b' }),
  });

  const side = (which: Side) => (
    <div className={styles.side}>
      <CommitField className={styles.sideName} value={state[which].name} label={t('name')} onCommit={(name) => apply({ type: 'rename', side: which, name })} />
      <button type="button" className={styles.big} onClick={() => apply({ type: 'add', side: which })}>
        +1
      </button>
      <button type="button" className={styles.btn} onClick={() => apply({ type: 'sub', side: which })}>
        −1
      </button>
    </div>
  );

  return (
    <>
      <div className={styles.sides}>
        {side('a')}
        {side('b')}
      </div>
      <div className={styles.row}>
        <CommitField className={styles.field} value={state.label} placeholder={t('label')} label={t('label')} onCommit={(text) => apply({ type: 'label', text })} />
        {textClock && <CommitField className={styles.field} value={state.clock} placeholder={t('clock')} label={t('clock')} onCommit={(text) => apply({ type: 'clock', text })} />}
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.btn} onClick={() => apply({ type: 'swap' })}>
          {t('swap')}
        </button>
        <button type="button" className={styles.btn} onClick={() => window.confirm(t('resetConfirm')) && apply({ type: 'reset' })}>
          {t('reset')}
        </button>
      </div>
      <p className={styles.hint}>{t('keysScore')}</p>
    </>
  );
}

/* ------------------------------------------------------------------ table tennis */

function PingisControls({ state, apply }: { state: PingisState; apply: (action: LiveAction) => void }) {
  const t = useTranslations('live.control');
  const over = state.winner !== null;
  useKeys({
    q: () => apply({ type: 'point', side: 'a' }),
    p: () => apply({ type: 'point', side: 'b' }),
    z: () => apply({ type: 'undo' }),
    n: () => apply({ type: 'nextGame' }),
  });

  const side = (which: Side) => (
    <div className={styles.side}>
      <CommitField className={styles.sideName} value={state[which].name} label={t('name')} onCommit={(name) => apply({ type: 'rename', side: which, name })} />
      <button type="button" className={styles.big} disabled={over || state.gameWon !== null} onClick={() => apply({ type: 'point', side: which })}>
        +1
      </button>
      <label className={styles.serveRow}>
        <input type="radio" name="serve" checked={state.firstServer === which} onChange={() => apply({ type: 'setServer', side: which })} />
        {t('firstServe')}
      </label>
    </div>
  );

  return (
    <>
      <div className={styles.sides}>
        {side('a')}
        {side('b')}
      </div>
      <div className={styles.row}>
        {state.gameWon && !over && (
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => apply({ type: 'nextGame' })}>
            {t('nextGame')}
          </button>
        )}
        <button type="button" className={styles.btn} onClick={() => apply({ type: 'undo' })} disabled={state.undo.length === 0}>
          {t('undo')}
        </button>
        <select className={styles.field} value={state.bestOf} aria-label={t('bestOf')} onChange={(event) => apply({ type: 'bestOf', games: Number(event.target.value) as 3 | 5 | 7 })}>
          {[3, 5, 7].map((games) => (
            <option key={games} value={games}>
              {t('bestOfN', { games })}
            </option>
          ))}
        </select>
        <button type="button" className={styles.btn} onClick={() => window.confirm(t('newMatchConfirm')) && apply({ type: 'reset' })}>
          {t('newMatch')}
        </button>
      </div>
      <CommitField className={styles.field} value={state.label} placeholder={t('label')} label={t('label')} onCommit={(text) => apply({ type: 'label', text })} />
      <p className={styles.hint}>{t('keysPingis')}</p>
    </>
  );
}

/* ------------------------------------------------------------------ lower thirds */

function LowerControls({ state, apply }: { state: LowerState; apply: (action: LiveAction) => void }) {
  const t = useTranslations('live.control');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  useKeys({
    ' ': () => apply(state.visible ? { type: 'next' } : { type: 'show' }),
    arrowright: () => apply({ type: 'next' }),
    arrowleft: () => apply({ type: 'prev' }),
    h: () => apply({ type: 'hide' }),
    escape: () => apply({ type: 'hide' }),
  });

  const add = () => {
    if (!title.trim()) return;
    apply({ type: 'add', item: { title, subtitle } });
    setTitle('');
    setSubtitle('');
  };

  return (
    <>
      <div className={styles.row}>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => apply({ type: 'show' })} disabled={state.visible}>
          {t('show')}
        </button>
        <button type="button" className={styles.btn} onClick={() => apply({ type: 'hide' })} disabled={!state.visible}>
          {t('hide')}
        </button>
        <button type="button" className={styles.btn} onClick={() => apply({ type: 'prev' })} disabled={state.index === 0}>
          {t('prev')}
        </button>
        <button type="button" className={styles.btn} onClick={() => apply({ type: 'next' })} disabled={state.index + 1 >= state.items.length}>
          {t('next')}
        </button>
      </div>

      <ol className={styles.queue}>
        {state.items.map((item, index) => (
          <li key={index} className={styles.item} data-on={state.visible && index === state.index}>
            <button type="button" className={styles.btn} onClick={() => apply({ type: 'show', index })} aria-label={t('showItem', { title: item.title })}>
              {index + 1}
            </button>
            <span className={styles.itemText}>
              <span className={styles.itemTitle}>{item.title}</span>
              <span className={styles.itemSub}>{item.subtitle}</span>
            </span>
            {state.visible && index === state.index && <span className={styles.status}>{t('onAir')}</span>}
            <button type="button" className={styles.btn} onClick={() => apply({ type: 'remove', index })} aria-label={t('remove')}>
              ×
            </button>
          </li>
        ))}
      </ol>

      <form
        className={styles.add}
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input className={styles.field} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('title')} aria-label={t('title')} />
        <input className={styles.field} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder={t('subtitle')} aria-label={t('subtitle')} />
        <button type="submit" className={styles.btn}>
          {t('add')}
        </button>
      </form>
      <p className={styles.hint}>{t('keysLower')}</p>
    </>
  );
}

export type { LiveStatus };

/* ------------------------------------------------------------------ handball */

function HandballControls({ state, apply }: { state: HandballState; apply: (action: LiveAction) => void }) {
  const t = useTranslations('live.control');
  const running = state.timer.since !== null;
  const now = useNow(running);
  const toggle = () => apply(running ? { type: 'stop', at: Date.now() } : { type: 'start', at: Date.now() });
  useKeys({
    ' ': toggle,
    s: () => apply({ type: 'suspend', side: 'a', at: Date.now() }),
    k: () => apply({ type: 'suspend', side: 'b', at: Date.now() }),
  });
  const left = penaltiesLeft(state, now);

  const nudge = (label: string, by: number) => (
    <button type="button" className={styles.btn} onClick={() => apply({ type: 'adjust', by, at: Date.now() })}>
      {label}
    </button>
  );

  const suspensions = (side: Side) => (
    <div className={styles.side}>
      <button type="button" className={styles.btn} onClick={() => apply({ type: 'suspend', side, at: Date.now() })} disabled={state.penalties[side].length >= 3 && left[side].length >= 3}>
        {t(side === 'a' ? 'suspendA' : 'suspendB')}
      </button>
      {left[side].map((remaining, index) => (
        <button key={index} type="button" className={styles.btn} onClick={() => apply({ type: 'endSuspension', side, index })} aria-label={t('endSuspension')}>
          {remaining} ×
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className={styles.clockBox}>
        <span className={styles.clockText}>{clockText(elapsedMs(state, now))}</span>
        <span className={styles.status}>{t('periodN', { period: state.period })}</span>
      </div>
      <div className={styles.row}>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={toggle}>
          {running ? t('stop') : t('start')}
        </button>
        {nudge('−1 min', -60_000)}
        {nudge('−10 s', -10_000)}
        {nudge('+10 s', 10_000)}
        {nudge('+1 min', 60_000)}
      </div>
      <div className={styles.row}>
        {([1, 2, 3, 4] as const).map((period) => (
          <button key={period} type="button" className={styles.btn} data-on={state.period === period} onClick={() => window.confirm(t('periodConfirm', { period })) && apply({ type: 'period', period })}>
            {t('periodN', { period })}
          </button>
        ))}
      </div>
      <div className={styles.sides}>
        {suspensions('a')}
        {suspensions('b')}
      </div>
      <ScoreControls state={state} apply={apply} textClock={false} />
      <p className={styles.hint}>{t('keysHandball')}</p>
    </>
  );
}

/* ------------------------------------------------------------------ ranking */

const QUICK_POINTS = [1, 2, 3, 5, 8, 10, 12] as const;

function RankingControls({ state, apply }: { state: RankingState; apply: (action: LiveAction) => void }) {
  const t = useTranslations('live.control');
  const [name, setName] = useState('');

  return (
    <>
      <CommitField className={styles.field} value={state.title} placeholder={t('rankingTitle')} label={t('rankingTitle')} onCommit={(text) => apply({ type: 'title', text })} />

      <ol className={styles.queue}>
        {state.entries.map((entry, index) => (
          <li key={index} className={styles.rankItem} data-on={state.highlight === index}>
            <CommitField className={styles.sideName} value={entry.name} label={t('name')} onCommit={(next) => apply({ type: 'renameEntry', index, name: next })} />
            <span className={styles.rankPointsBox}>{entry.points}</span>
            <span className={styles.rankButtons}>
              {QUICK_POINTS.map((by) => (
                <button key={by} type="button" className={styles.btn} onClick={() => apply({ type: 'points', index, by })}>
                  +{by}
                </button>
              ))}
              <button type="button" className={styles.btn} onClick={() => apply({ type: 'points', index, by: -1 })} aria-label={t('minusOne')}>
                −1
              </button>
              <button type="button" className={styles.btn} onClick={() => apply({ type: 'highlight', index: state.highlight === index ? -1 : index })}>
                {state.highlight === index ? t('unhighlight') : t('highlight')}
              </button>
              <button type="button" className={styles.btn} onClick={() => window.confirm(t('removeEntryConfirm', { name: entry.name })) && apply({ type: 'removeEntry', index })} aria-label={t('remove')}>
                ×
              </button>
            </span>
          </li>
        ))}
      </ol>

      <form
        className={styles.add}
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) apply({ type: 'addEntry', name });
          setName('');
        }}
      >
        <input className={styles.field} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('entryName')} aria-label={t('entryName')} />
        <span />
        <button type="submit" className={styles.btn}>
          {t('add')}
        </button>
      </form>
      <div className={styles.row}>
        <button type="button" className={styles.btn} onClick={() => window.confirm(t('resetPointsConfirm')) && apply({ type: 'resetPoints' })}>
          {t('resetPoints')}
        </button>
      </div>
    </>
  );
}
