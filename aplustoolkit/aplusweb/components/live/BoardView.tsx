'use client';

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { gamesToWin } from '@aplus/live/pingis';
import { isColor, onColor, themeToCss, type Theme } from '@aplus/live/theme';
import { handballView } from '@aplus/live/handball';
import { standings } from '@aplus/live/ranking';
import type { BoardKind, BoardState, HandballState, LowerState, PingisState, RankingState, ScoreState, Side } from '@aplus/live/types';
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
/** The theme being drawn, for the parts that need to know a colour and not only use it. */
const ThemeContext = createContext<Theme | null>(null);
const useTheme = () => useContext(ThemeContext)!;

const sideVar = (side: Side) => (side === 'a' ? '--lv-side-a' : '--lv-side-b');

/** A side's own colour if it has a valid one, else the theme's. */
const sideColor = (theme: Theme, info: { color: string }, side: Side) => (isColor(info.color) ? info.color : theme.sides[side === 'a' ? 0 : 1]);

/** The style that paints something in a side's colour, with a readable colour for the type that sits on it. */
const badgeFor = (theme: Theme, info: { color: string }, side: Side): CSSProperties => {
  const color = sideColor(theme, info, side);
  return { '--badge': color, '--on': onColor(color) } as CSSProperties;
};
const useBadge = (info: { color: string }, side: Side) => badgeFor(useTheme(), info, side);

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
  const running = kind === 'handball' && ((state as HandballState).timer.since !== null || (state as HandballState).timeout !== null);
  const now = useNow(running);
  const vars = themeToCss(theme) as CSSProperties;
  // A handball board is drawn as a score, with the match clock as its clock and the suspensions beside it.
  const view = kind === 'handball' ? handballView(state as HandballState, now, (period) => t('period', { period })) : null;
  const score = (view ?? state) as ScoreState;
  let content: ReactNode;
  let full = false;

  if (kind === 'lower') {
    content = <LowerBlock state={state as LowerState} theme={theme} />;
  } else if (kind === 'ranking') {
    content = <Ranking state={state as RankingState} />;
  } else if (kind === 'pingis') {
    const pingis = state as PingisState;
    if (theme.design === 'college') content = <College rows={pingisRows(pingis)} clock="" label={pingis.label} />;
    else if (theme.design === 'stack') content = <Stack rows={pingisRows(pingis)} clock="" label={pingis.label} />;
    else content = <BroadcastPingis state={pingis} winnerLabel={winnerLabel} />;
  } else if (theme.design === 'bars') {
    content = <Bars state={score} />;
    full = true;
  } else if (theme.design === 'pixel') {
    content = <PixelFrame state={score} />;
    full = true;
  } else if (theme.design === 'league') {
    content = <League state={score} />;
  } else if (theme.design === 'stack') {
    content = <Stack rows={scoreRows(score)} clock={score.clock} label={score.label} />;
  } else if (theme.design === 'pill') {
    content = <Pill state={score} />;
  } else if (theme.design === 'college') {
    content = <College rows={scoreRows(score)} clock={score.clock} label={score.label} />;
  } else {
    content = <BroadcastScore state={score} />;
  }

  if (view && !full) {
    content = (
      <Penalized penalties={view.penalties} timeout={view.timeout ? { ...view.timeout, label: t('timeoutChip') } : null}>
        {content}
      </Penalized>
    );
  }

  if (full) {
    return (
      <ThemeContext.Provider value={theme}>
        <div className={styles.root} style={vars} data-anim={theme.animation}>
          {content}
        </div>
      </ThemeContext.Provider>
    );
  }

  const placed = place(position, scale);
  return (
    <ThemeContext.Provider value={theme}>
      <div className={styles.root} style={vars} data-anim={theme.animation}>
        <div className={styles.slot} style={placed.outer}>
          <div style={placed.inner}>{content}</div>
        </div>
      </div>
    </ThemeContext.Provider>
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

/* ------------------------------------------------------------------ two-row designs (college, stack) */

/** One side of a two-row design, whatever the sport: table tennis has sets and a serve, a plain score has neither. */
interface Row {
  side: Side;
  name: string;
  logo: string;
  color: string;
  points: number;
  sets?: number;
  serving?: boolean;
}

const scoreRows = (state: ScoreState): [Row, Row] => [
  { side: 'a', name: state.a.name, logo: state.a.logo, color: state.a.color, points: state.a.score },
  { side: 'b', name: state.b.name, logo: state.b.logo, color: state.b.color, points: state.b.score },
];

const pingisRows = (state: PingisState): [Row, Row] => {
  const serving = (side: Side) => state.server === side && !state.winner && !state.gameWon;
  return [
    { side: 'a', name: state.a.name, logo: state.a.logo, color: state.a.color, points: state.a.points, sets: state.a.sets, serving: serving('a') },
    { side: 'b', name: state.b.name, logo: state.b.logo, color: state.b.color, points: state.b.points, sets: state.b.sets, serving: serving('b') },
  ];
};

function Mark({ row, className }: { row: Row; className: string | undefined }) {
  const url = safeUrl(row.logo);
  const style = useBadge(row, row.side);
  return (
    <span className={className}>
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" />
      ) : (
        <span className={styles.bugBadge} style={style}>
          {initials(row.name)}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ college scorebug */

function College({ rows, clock, label }: { rows: [Row, Row]; clock: string; label: string }) {
  const sets = rows[0].sets !== undefined;
  return (
    <div className={styles.bug}>
      <div className={styles.bugRows}>
        {rows.map((row, index) => (
          <div key={row.side} className={`${styles.bugRow} ${sets ? styles.bugRowSets : ''} ${index === 0 ? styles.bugRowLight : styles.bugRowDark}`}>
            <Mark row={row} className={styles.bugLogo} />
            <span className={styles.bugName}>
              {row.name}
              {row.serving && <span className={styles.bugServe} />}
            </span>
            {sets && (
              <span className={styles.bugSets}>
                <Num value={row.sets!} />
              </span>
            )}
            <span className={styles.bugScore}>
              <Num value={row.points} />
            </span>
          </div>
        ))}
      </div>
      {(clock || label) && (
        <div className={styles.bugClock}>
          {clock && <span className={styles.bugClockTime}>{clock}</span>}
          {label && <span className={styles.bugClockLabel}>{label}</span>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ stack (our own): each row in its side's colour */

function Stack({ rows, clock, label }: { rows: [Row, Row]; clock: string; label: string }) {
  const theme = useTheme();
  const sets = rows[0].sets !== undefined;
  return (
    <div className={styles.stack}>
      {rows.map((row) => {
        const style = badgeFor(theme, row, row.side);
        const url = safeUrl(row.logo);
        return (
          <div key={row.side} className={styles.stackRow} style={style}>
            <span className={styles.stackMark}>{url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" /> : initials(row.name)}</span>
            <span className={styles.stackName}>
              {row.name}
              {row.serving && <span className={styles.stackServe} />}
            </span>
            {sets && (
              <span className={styles.stackSets}>
                <Num value={row.sets!} />
              </span>
            )}
            <span className={styles.stackScore}>
              <Num value={row.points} />
            </span>
          </div>
        );
      })}
      {(clock || label) && <div className={styles.stackFoot}>{[label, clock].filter(Boolean).join('  ·  ')}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ pill (our own): a capsule with round score badges */

function Pill({ state }: { state: ScoreState }) {
  const theme = useTheme();
  const end = (side: Side, info: ScoreState['a']) => {
    const url = safeUrl(info.logo);
    return (
      <span className={`${styles.pillEnd} ${side === 'a' ? styles.pillEndA : styles.pillEndB}`} style={badgeFor(theme, info, side)}>
        {url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" />}
        <span>{info.name}</span>
      </span>
    );
  };
  return (
    <div className={styles.pill}>
      {end('a', state.a)}
      <span className={styles.pillScore}>
        <Num value={state.a.score} />
      </span>
      <span className={styles.pillMid}>
        {state.clock && <span className={styles.pillClock}>{state.clock}</span>}
        {state.label && <span className={styles.pillLabel}>{state.label}</span>}
      </span>
      <span className={styles.pillScore}>
        <Num value={state.b.score} />
      </span>
      {end('b', state.b)}
    </div>
  );
}

/* ------------------------------------------------------------------ handball bars */

function LogoBlock({ side, info }: { side: Side; info: ScoreState['a'] }) {
  const url = safeUrl(info.logo);
  const style = useBadge(info, side);
  return (
    <span className={styles.block} style={style}>
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
  if (theme.design === 'tag') return <TagName item={item} hidden={hidden} animation={theme.animation} />;
  if (theme.design === 'line') return <LineName item={item} hidden={hidden} animation={theme.animation} />;
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
  const theme = useTheme();
  const end = (side: Side, info: ScoreState['a']) => {
    const url = safeUrl(info.logo);
    return (
      <span className={`${styles.leagueEnd} ${side === 'a' ? styles.leagueEndA : styles.leagueEndB}`} style={badgeFor(theme, info, side)}>
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
function Penalized({ penalties, timeout, children }: { penalties: { a: string[]; b: string[] }; timeout: { side: Side; left: string; label: string } | null; children: ReactNode }) {
  const chips = ([['a', penalties.a], ['b', penalties.b]] as const).flatMap(([side, list]) => list.map((left, index) => ({ side, left, key: side + index })));
  return (
    <div>
      {children}
      {(chips.length > 0 || timeout) && (
        <div className={styles.penalties}>
          {timeout && (
            <span className={styles.penalty} style={{ '--badge': `var(${sideVar(timeout.side)})` } as CSSProperties}>
              {timeout.label} · {timeout.left}
            </span>
          )}
          {chips.map((chip) => (
            <span key={chip.key} className={styles.penalty} style={{ '--badge': `var(${sideVar(chip.side)})`, '--on': '#ffffff' } as CSSProperties}>
              2 min · {chip.left}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ ranking (a jury round, a leaderboard) */

const RANK_ROW = 64;

function Ranking({ state }: { state: RankingState }) {
  const rows = standings(state).slice(0, 12);
  const top = Math.max(1, ...state.entries.map((entry) => entry.points));
  return (
    <div className={styles.rank}>
      <div className={styles.rankTitle}>{state.title}</div>
      <div className={styles.rankBody} style={{ height: rows.length * RANK_ROW }}>
        {rows.map((row, position) => (
          <div
            key={row.index}
            className={`${styles.rankRow} ${state.highlight === row.index ? styles.rankOn : ''}`}
            style={{ top: position * RANK_ROW, '--bar': isColor(row.color) ? row.color : 'var(--lv-accent)', '--w': `${Math.round((row.points / top) * 100)}%` } as CSSProperties}
          >
            <span className={styles.rankPlace}>{row.place}</span>
            <span className={styles.rankName}>{row.name}</span>
            <span className={styles.rankBar}>
              <span />
            </span>
            <span className={styles.rankPoints}>
              <Num value={row.points} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tag (our own): a name box with a tab above it */

function TagName({ item, hidden, animation }: { item: LowerState['items'][number]; hidden: boolean; animation: string }) {
  return (
    <div className={`${styles.tagWrap} ${hidden ? styles.lowerHidden : ''}`} data-anim={animation} aria-hidden={hidden}>
      {item.subtitle && <span className={styles.tagTab}>{item.subtitle}</span>}
      <span className={styles.tagName}>{item.title}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ line (our own): type on the picture with a line under it */

function LineName({ item, hidden, animation }: { item: LowerState['items'][number]; hidden: boolean; animation: string }) {
  return (
    <div className={`${styles.lineWrap} ${hidden ? styles.lowerHidden : ''}`} data-anim={animation} aria-hidden={hidden}>
      <span className={styles.lineName}>{item.title}</span>
      <span className={styles.lineBar} />
      {item.subtitle && <span className={styles.lineSub}>{item.subtitle}</span>}
    </div>
  );
}
