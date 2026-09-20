'use client';

import type { CSSProperties, ReactNode } from 'react';
import { gamesToWin } from '@aplus/live/pingis';
import { isColor, themeToCss, type Theme } from '@aplus/live/theme';
import { handballView } from '@aplus/live/handball';
import type { BoardKind, BoardState, HandballState, LowerState, PingisState, ScoreState, Side } from '@aplus/live/types';
import { useTranslations } from 'next-intl';
import { useNow } from '@/lib/live/useNow';
import type { Position } from '@/lib/live/position';
import styles from './Designs.module.css';

export interface BoardViewProps {
  kind: BoardKind;
  state: BoardState;
  theme: Theme;
  /** Where a panel sits on the picture. Full-width designs ignore it. */
  position?: Position;
  /** 1 is the size the design was drawn at. */
  scale?: number;
  winnerLabel?: string;
}

/* ------------------------------------------------------------------ small helpers */

const flagUrl = (code: string) => (/^[A-Za-z]{2}$/.test(code) ? `https://flagcdn.com/48x36/${code.toLowerCase()}.png` : '');
/** An image URL that is safe to draw: http(s) or a data image, nothing else. */
const safeUrl = (url: string) => (/^https?:\/\//i.test(url) || /^data:image\//i.test(url) ? url : '');
const initials = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 3).toUpperCase() || '?';
/** A side's own colour if it has a valid one, else the theme's. */
const badge = (color: string, fallbackVar: string): CSSProperties => ({ '--badge': isColor(color) ? color : `var(${fallbackVar})` }) as CSSProperties;
const sideVar = (side: Side) => (side === 'a' ? '--lv-side-a' : '--lv-side-b');

/** "Truls Moregard" -> a light first name and a bold surname, as a broadcast prints it. */
function Who({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return <b>{name}</b>;
  return (
    <>
      <span>{parts.slice(0, -1).join(' ')}</span>
      <b>{parts[parts.length - 1]}</b>
    </>
  );
}

/** A number that plays its change animation when it changes. */
function Num({ value }: { value: number | string }) {
  return (
    <span key={String(value)} className={styles.num}>
      {value}
    </span>
  );
}

/** The corner or edge a card sits in: the first letter is the row, the second the column. */
function place(position: Position, scale: number): { outer: CSSProperties; inner: CSSProperties } {
  const row = position[0] === 't' ? 'flex-start' : position[0] === 'c' ? 'center' : 'flex-end';
  const column = position[1] === 'l' ? 'flex-start' : position[1] === 'c' ? 'center' : 'flex-end';
  const originY = position[0] === 't' ? 'top' : position[0] === 'c' ? 'center' : 'bottom';
  const originX = position[1] === 'l' ? 'left' : position[1] === 'c' ? 'center' : 'right';
  return { outer: { alignItems: row, justifyContent: column }, inner: { transform: `scale(${scale})`, transformOrigin: `${originY} ${originX}` } };
}

/* ------------------------------------------------------------------ the dispatcher */

/** The overlay for a board: its design, in its theme's paint, at 1920×1080. Pure drawing, no state of its own. */
export function BoardView({ kind, state, theme, position = 'bl', scale = 1, winnerLabel = 'Vinnare' }: BoardViewProps) {
  const t = useTranslations('live');
  const running = kind === 'handball' && (state as HandballState).timer.since !== null;
  const now = useNow(running);
  const vars = themeToCss(theme) as CSSProperties;
  // A handball board is drawn as a score, with the match clock as its clock and the suspensions beside it.
  const view = kind === 'handball' ? handballView(state as HandballState, now, (period) => t('period', { period })) : null;
  const score = (view ?? state) as ScoreState;
  let content: ReactNode;
  let full = false;

  if (kind === 'lower') {
    content = <LowerBlock state={state as LowerState} theme={theme} />;
  } else if (kind === 'pingis') {
    content = <BroadcastPingis state={state as PingisState} winnerLabel={winnerLabel} />;
  } else if (theme.design === 'bars') {
    content = <Bars state={score} />;
    full = true;
  } else if (theme.design === 'pixel') {
    content = <PixelFrame state={score} />;
    full = true;
  } else if (theme.design === 'league') {
    content = <League state={score} />;
  } else if (theme.design === 'college') {
    content = <College state={score} />;
  } else {
    content = <BroadcastScore state={score} />;
  }

  if (view && !full) content = <Penalized penalties={view.penalties}>{content}</Penalized>;

  if (full) {
    return (
      <div className={styles.root} style={vars} data-anim={theme.animation}>
        {content}
      </div>
    );
  }

  const placed = place(position, scale);
  return (
    <div className={styles.root} style={vars} data-anim={theme.animation}>
      <div className={styles.slot} style={placed.outer}>
        <div style={placed.inner}>{content}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ broadcast panel (table tennis, and a plain score) */

function Crest({ name, logo, tint }: { name: string; logo: string; tint?: string }) {
  const url = safeUrl(logo);
  return (
    <div className={styles.crest}>
      <div className={styles.crestDisc} style={tint ? ({ color: tint } as CSSProperties) : undefined}>
        {url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" /> : initials(name)}
      </div>
    </div>
  );
}

function BroadcastRow({ side, name, flag, serving, sets, points, won }: { side: Side; name: string; flag: string; serving: boolean; sets?: number; points: number; won: boolean }) {
  const flagSrc = flagUrl(flag);
  return (
    <div className={`${styles.rowLine} ${won ? styles.won : ''}`} data-side={side}>
      {flagSrc ? /* eslint-disable-next-line @next/next/no-img-element */ <img className={styles.flag} src={flagSrc} alt="" /> : <span className={styles.flagNone} />}
      <span className={styles.who}>
        <Who name={name} />
      </span>
      {serving ? <span className={styles.serve} /> : <span />}
      {sets !== undefined ? (
        <span className={`${styles.cell} ${styles.cellSets}`}>
          <Num value={sets} />
        </span>
      ) : (
        <span />
      )}
      <span className={`${styles.cell} ${sets !== undefined ? styles.cellPoints : styles.cellSets}`}>
        <Num value={points} />
      </span>
    </div>
  );
}

function BroadcastPingis({ state, winnerLabel }: { state: PingisState; winnerLabel: string }) {
  const over = state.winner !== null;
  const serving = (side: Side) => state.server === side && !over && !state.gameWon;
  return (
    <div className={styles.panelWrap}>
      {state.label && <div className={styles.tag}>{state.label}</div>}
      <div className={styles.panel}>
        <Crest name={state.a.name} logo={state.a.logo || state.b.logo} />
        <div className={styles.rows}>
          <BroadcastRow side="a" name={state.a.name} flag={state.a.flag} serving={serving('a')} sets={state.a.sets} points={state.a.points} won={state.winner === 'a'} />
          <BroadcastRow side="b" name={state.b.name} flag={state.b.flag} serving={serving('b')} sets={state.b.sets} points={state.b.points} won={state.winner === 'b'} />
        </div>
      </div>
      {(state.games.length > 0 || over) && (
        <div className={styles.strip}>
          {state.games.map((game, index) => (
            <span key={index}>
              {game.a}-{game.b}
            </span>
          ))}
          {over && (
            <span className={styles.won}>
              {winnerLabel}: {state[state.winner!].name} ({gamesToWin(state.bestOf)}-{state.winner === 'a' ? state.b.sets : state.a.sets})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BroadcastScore({ state }: { state: ScoreState }) {
  return (
    <div className={styles.panelWrap}>
      {(state.label || state.clock) && <div className={styles.tag}>{[state.label, state.clock].filter(Boolean).join('  ·  ')}</div>}
      <div className={styles.panel}>
        <Crest name={state.a.name} logo={state.a.logo} />
        <div className={styles.rows}>
          <BroadcastRow side="a" name={state.a.name} flag={state.a.flag} serving={false} points={state.a.score} won={false} />
          <BroadcastRow side="b" name={state.b.name} flag={state.b.flag} serving={false} points={state.b.score} won={false} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ college scorebug */

function BugLogo({ side, info }: { side: Side; info: ScoreState['a'] }) {
  const url = safeUrl(info.logo);
  return (
    <span className={styles.bugLogo}>
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" />
      ) : (
        <span className={styles.bugBadge} style={badge(info.color, sideVar(side))}>
          {initials(info.name)}
        </span>
      )}
    </span>
  );
}

function College({ state }: { state: ScoreState }) {
  return (
    <div className={styles.bug}>
      <div className={styles.bugRows}>
        <div className={`${styles.bugRow} ${styles.bugRowLight}`}>
          <BugLogo side="a" info={state.a} />
          <span className={styles.bugName}>{state.a.name}</span>
          <span className={styles.bugScore}>
            <Num value={state.a.score} />
          </span>
        </div>
        <div className={`${styles.bugRow} ${styles.bugRowDark}`}>
          <BugLogo side="b" info={state.b} />
          <span className={styles.bugName}>{state.b.name}</span>
          <span className={styles.bugScore}>
            <Num value={state.b.score} />
          </span>
        </div>
      </div>
      {(state.clock || state.label) && (
        <div className={styles.bugClock}>
          {state.clock && <span className={styles.bugClockTime}>{state.clock}</span>}
          {state.label && <span className={styles.bugClockLabel}>{state.label}</span>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ handball bars */

function LogoBlock({ side, info }: { side: Side; info: ScoreState['a'] }) {
  const url = safeUrl(info.logo);
  return (
    <span className={styles.block} style={badge(info.color, sideVar(side))}>
      {url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" /> : initials(info.name)}
    </span>
  );
}

function Bars({ state }: { state: ScoreState }) {
  return (
    <>
      {state.label && (
        <div className={`${styles.bar} ${styles.barTop}`}>
          <span className={styles.barTitle}>{state.label}</span>
        </div>
      )}
      <div className={`${styles.bar} ${styles.barBottom}`}>
        <span className={styles.barScore}>
          <Num value={state.a.score} />
        </span>
        <span className={styles.blocks}>
          <LogoBlock side="a" info={state.a} />
          <LogoBlock side="b" info={state.b} />
        </span>
        <span className={styles.barScore}>
          <Num value={state.b.score} />
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Minecraft gold frame */

function PixelFrame({ state }: { state: ScoreState }) {
  const icon = safeUrl(state.a.logo);
  return (
    <div className={styles.frame}>
      <div className={`${styles.frameTop} ${styles.tiles}`} />
      <div className={`${styles.frameLeft} ${styles.tiles}`} />
      <div className={`${styles.frameRight} ${styles.tiles}`} />
      <div className={`${styles.dock} ${styles.tiles}`}>
        <div className={styles.dockRow}>
          <span className={styles.pixelTitle}>{state.label || 'A+ Live'}</span>
          <span className={styles.pixelIcon}>{icon ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={icon} alt="" /> : initials(state.label || 'A+')}</span>
        </div>
        <div className={styles.dockRow}>
          <span className={styles.pixelSub}>{state.clock}</span>
        </div>
        <div className={styles.dockRow}>
          <div className={styles.pixelStats}>
            <span className={styles.pixelStat}>{state.a.name}</span>
            <span className={styles.pixelBox}>
              <Num value={state.a.score} />
            </span>
            <span className={styles.pixelBox}>
              <Num value={state.b.score} />
            </span>
            <span className={`${styles.pixelStat} ${styles.pixelStatRight}`}>{state.b.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ name block */

function LowerBlock({ state, theme }: { state: LowerState; theme: Theme }) {
  const item = state.items[state.index];
  // Keep drawing the last item while it slides out, so it leaves as what was on air and not as an empty box.
  if (!item) return null;
  const hidden = !state.visible;
  if (theme.design === 'ribbon') return <Ribbon item={item} hidden={hidden} animation={theme.animation} />;
  return (
    <div className={`${styles.lower} ${hidden ? styles.lowerHidden : ''} ${theme.design === 'pixel' ? styles.lowerPixel : ''}`} data-anim={theme.animation} aria-hidden={hidden}>
      <div className={`${styles.lowerBody} ${theme.design === 'pixel' ? styles.tiles : ''}`}>
        <span className={styles.lowerName}>{item.title}</span>
        {item.subtitle && <span className={styles.lowerSub}>{item.subtitle}</span>}
      </div>
      {theme.design !== 'pixel' && <span className={styles.lowerStripe} />}
    </div>
  );
}

/* ------------------------------------------------------------------ league bar (our own)
   A wide bar: a name in each side's colour on a slanted end, the two scores in dark boxes, the clock between. */

function League({ state }: { state: ScoreState }) {
  const end = (side: Side, info: ScoreState['a']) => {
    const url = safeUrl(info.logo);
    return (
      <span className={`${styles.leagueEnd} ${side === 'a' ? styles.leagueEndA : styles.leagueEndB}`} style={badge(info.color, sideVar(side))}>
        {url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" />}
        <span>{info.name}</span>
      </span>
    );
  };
  return (
    <div className={styles.league}>
      {end('a', state.a)}
      <span className={styles.leagueScore}>
        <Num value={state.a.score} />
      </span>
      <span className={styles.leagueMid}>
        {state.clock && <span className={styles.leagueClock}>{state.clock}</span>}
        {state.label && <span className={styles.leagueLabel}>{state.label}</span>}
      </span>
      <span className={styles.leagueScore}>
        <Num value={state.b.score} />
      </span>
      {end('b', state.b)}
    </div>
  );
}

/* ------------------------------------------------------------------ ribbon (our own) */

function Ribbon({ item, hidden, animation }: { item: LowerState['items'][number]; hidden: boolean; animation: string }) {
  return (
    <div className={`${styles.ribbon} ${hidden ? styles.lowerHidden : ''}`} data-anim={animation} aria-hidden={hidden}>
      <span className={styles.ribbonName}>
        <span>{item.title}</span>
      </span>
      {item.subtitle && (
        <span className={styles.ribbonSub}>
          <span>{item.subtitle}</span>
        </span>
      )}
    </div>
  );
}

/** The suspensions still running, as small chips under a panel. */
function Penalized({ penalties, children }: { penalties: { a: string[]; b: string[] }; children: ReactNode }) {
  const chips = ([['a', penalties.a], ['b', penalties.b]] as const).flatMap(([side, list]) => list.map((left, index) => ({ side, left, key: side + index })));
  return (
    <div>
      {children}
      {chips.length > 0 && (
        <div className={styles.penalties}>
          {chips.map((chip) => (
            <span key={chip.key} className={styles.penalty} style={{ '--badge': `var(${sideVar(chip.side)})` } as CSSProperties}>
              2 min · {chip.left}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
