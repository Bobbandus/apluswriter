'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { clap, currentLabel, defaultSlate, edit, normalizeSlate, open, slateDate, type SlateField, type SlateState } from '@aplus/shoot/slate';
import { formatTimecode } from '@aplus/shoot/timecode';
import { SlatePanel } from './SlatePanel';
import { playClap } from './clapSound';
import styles from './Slate.module.css';

const STORAGE_KEY = 'aplus.shoot.slate.v1';
/** How long the stick takes to fall. The clock freezes when it lands, not when it was tapped. */
const CLAP_MS = 110;
/** A horizontal drag this long, and clearly more sideways than up or down, is a swipe. */
const SWIPE_PX = 60;

function load(): SlateState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSlate(JSON.parse(raw)) : defaultSlate();
  } catch {
    return defaultSlate();
  }
}

function lengthClass(value: string, big: boolean): 'long' | 'longer' | undefined {
  const [long, longer] = big ? [5, 8] : [18, 28];
  return value.length > longer ? 'longer' : value.length > long ? 'long' : undefined;
}

const isSwipe = (dx: number, dy: number, direction: -1 | 1) => dx * direction > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5;

/**
 * A+ Shoot's slate. The board fills the screen; tapping the sticks claps them
 * and freezes the timecode on the frame they meet, tapping again opens them and
 * lets the clock run. Swipe left (or tap a box) for the panel where everything
 * on it can be changed.
 */
export function Slate() {
  const t = useTranslations('shoot');
  const [state, setState] = useState<SlateState | null>(null);
  const [falling, setFalling] = useState(false);
  const [panel, setPanel] = useState<{ open: boolean; focus: SlateField | null }>({ open: false, focus: null });
  const [flash, setFlash] = useState(0);
  const [today, setToday] = useState('');

  const stateRef = useRef<SlateState | null>(null);
  stateRef.current = state;
  const tcRef = useRef<HTMLSpanElement>(null);
  const swipe = useRef<{ x: number; y: number; swiped: boolean }>({ x: 0, y: 0, swiped: false });

  // Storage is the browser's, so the slate appears once it is read: no flash of defaults over last night's scene.
  useEffect(() => setState(load()), []);
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private mode or a full disk: the slate still works, it just forgets on reload.
    }
  }, [state]);

  // Today's date, kept current past midnight on a night shoot.
  useEffect(() => {
    const tick = () => setToday(slateDate(new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // The clock. Written straight into the DOM every frame rather than through React state.
  useEffect(() => {
    let raf = 0;
    let last = '';
    const frame = () => {
      const s = stateRef.current;
      if (s && tcRef.current) {
        const text = s.closed && s.frozenTc ? s.frozenTc : formatTimecode(currentLabel(s, Date.now()), s.rate);
        if (text !== last) {
          tcRef.current.textContent = text;
          last = text;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keep the screen on while the slate is up. Not every browser can; the panel says so.
  const [wakeSupported, setWakeSupported] = useState(true);
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) {
      setWakeSupported(false);
      return;
    }
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await nav.wakeLock!.request('screen');
        if (gone) void l.release();
        else lock = l;
      } catch {
        // Battery saver or a denied permission. Nothing to do but carry on.
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, []);

  const update = useCallback((patch: Partial<SlateState>) => setState((s) => (s ? edit(s, patch) : s)), []);
  const replace = useCallback((next: SlateState) => setState(next), []);

  const toggleSticks = useCallback(() => {
    const s = stateRef.current;
    if (!s || falling) return;
    if (s.closed) {
      setState((cur) => (cur ? open(cur) : cur));
      return;
    }
    setFalling(true);
    // Sound has to be unlocked inside the tap itself; it plays when the stick lands.
    if (s.sound) playClap(CLAP_MS / 1000);
    window.setTimeout(() => {
      const now = Date.now();
      setState((cur) => (cur ? clap(cur, formatTimecode(currentLabel(cur, now), cur.rate), now) : cur));
      setFlash((n) => n + 1);
      setFalling(false);
      navigator.vibrate?.(25);
    }, CLAP_MS);
  }, [falling]);

  const openPanel = useCallback((focus: SlateField | null = null) => setPanel({ open: true, focus }), []);
  const closePanel = useCallback(() => setPanel({ open: false, focus: null }), []);

  // Keyboard: space claps, E opens the panel, Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        if (e.key === 'Escape') closePanel();
        return;
      }
      if (e.key === 'Escape') closePanel();
      else if (panel.open) return;
      // A focused button already answers space and Enter itself; handling them here too would clap twice.
      else if ((e.key === ' ' || e.key === 'Enter') && !target?.closest('button, a')) {
        e.preventDefault();
        toggleSticks();
      } else if (e.key === 'e' || e.key === 'E' || e.key === 'ArrowLeft') {
        e.preventDefault();
        openPanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel.open, toggleSticks, openPanel, closePanel]);

  const onPointerDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, swiped: false };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (isSwipe(e.clientX - swipe.current.x, e.clientY - swipe.current.y, -1)) {
      swipe.current.swiped = true;
      openPanel();
    }
  };
  /** A tap that ended a swipe is not a tap. */
  const tapped = () => {
    if (swipe.current.swiped) {
      swipe.current.swiped = false;
      return false;
    }
    return true;
  };

  if (!state) return <div className={styles.stage} />;

  const shut = state.closed || falling;
  const L = state.labels;
  /** Long text is written smaller rather than cut off, as far as it can be. */
  const box = (field: SlateField, value: string, className?: string) => (
    <button
      type="button"
      className={`${styles.box} ${className ?? ''}`}
      data-len={lengthClass(value, Boolean(className))}
      onClick={() => tapped() && openPanel(field)}
      aria-label={`${L[field]}: ${value || '—'}`}
    >
      <span className={styles.label}>{L[field]}</span>
      <span className={styles.value}>{value}</span>
    </button>
  );

  return (
    <div className={styles.stage} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className={styles.slate} data-shut={shut || undefined}>
        <button
          type="button"
          className={styles.sticks}
          onClick={() => tapped() && toggleSticks()}
          aria-label={state.closed ? t('openSticks') : t('clap')}
          aria-pressed={state.closed}
        >
          <span className={`${styles.stick} ${styles.top}`}>
            <span className={styles.stripes} />
          </span>
          <span className={`${styles.stick} ${styles.bottom}`}>
            <span className={styles.stripes} />
          </span>
          <span className={styles.hinge}>
            <span className={styles.screw} />
            <span className={styles.brand}>
              A<span className={styles.plus}>+</span>
            </span>
            <span className={styles.screw} />
            <span className={styles.screw} />
          </span>
        </button>

        <div className={styles.board}>
          <div className={styles.display} role="timer" aria-live="off" data-frozen={state.closed || undefined}>
            <span className={styles.ghost} aria-hidden="true">
              88:88:88:88
            </span>
            <span className={styles.glow}>
              <span ref={tcRef} className={styles.tc} />
            </span>
            <span key={flash} className={flash ? styles.flash : undefined} aria-hidden="true" />
          </div>

          <div className={styles.row3}>
            {box('roll', state.roll, styles.big)}
            {box('scene', state.scene, styles.big)}
            {box('take', String(state.take), styles.big)}
          </div>
          <div className={styles.row1}>{box('prod', state.prod)}</div>
          <div className={styles.row2}>
            {box('dir', state.dir)}
            {box('dop', state.dop)}
          </div>
          <div className={styles.row2}>
            {box('note', state.note)}
            {box('date', state.date || today)}
          </div>
        </div>
      </div>

      <button type="button" className={styles.handle} onClick={() => tapped() && openPanel()} aria-label={t('settings')}>
        <span aria-hidden="true">‹</span>
      </button>

      <SlatePanel
        open={panel.open}
        focus={panel.focus}
        state={state}
        today={today}
        wakeSupported={wakeSupported}
        onChange={update}
        onReplace={replace}
        onClose={closePanel}
        isSwipeRight={(dx, dy) => isSwipe(dx, dy, 1)}
      />
    </div>
  );
}
