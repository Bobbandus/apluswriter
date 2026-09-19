'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Kbd } from './Kbd';
import styles from './Tooltip.module.css';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  label: string;
  /** A platform-neutral shortcut, rendered as a key hint inside the tip. */
  shortcut?: string;
  placement?: TooltipPlacement;
  /** Hover delay in ms. Focus always shows immediately. */
  delay?: number;
  children: ReactNode;
}

const GAP = 8;
const EDGE = 8;

export function Tooltip({ label, shortcut, placement = 'bottom', delay = 400, children }: TooltipProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  const show = useCallback(
    (immediate: boolean) => {
      clearTimer();
      if (immediate) {
        setOpen(true);
      } else {
        timer.current = window.setTimeout(() => setOpen(true), delay);
      }
    },
    [clearTimer, delay],
  );

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPos(null);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  // Measure after the tip is in the DOM but before paint, so it never appears
  // at 0,0 for a frame.
  useEffect(() => {
    if (!open) return;
    const trigger = wrapperRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;

    const t = trigger.getBoundingClientRect();
    const p = tip.getBoundingClientRect();

    let top: number;
    let left: number;

    switch (placement) {
      case 'top':
        top = t.top - p.height - GAP;
        left = t.left + t.width / 2 - p.width / 2;
        break;
      case 'left':
        top = t.top + t.height / 2 - p.height / 2;
        left = t.left - p.width - GAP;
        break;
      case 'right':
        top = t.top + t.height / 2 - p.height / 2;
        left = t.right + GAP;
        break;
      default:
        top = t.bottom + GAP;
        left = t.left + t.width / 2 - p.width / 2;
    }

    // Keep it on screen.
    left = Math.min(Math.max(EDGE, left), window.innerWidth - p.width - EDGE);
    top = Math.min(Math.max(EDGE, top), window.innerHeight - p.height - EDGE);

    setPos({ top, left });
  }, [open, placement]);

  // Escape dismisses, matching every other transient surface in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  return (
    <>
      <span
        ref={wrapperRef}
        className={styles.wrapper}
        aria-describedby={open ? id : undefined}
        onPointerEnter={() => show(false)}
        onPointerLeave={hide}
        onPointerDown={hide}
        onFocusCapture={() => show(true)}
        onBlurCapture={hide}
      >
        {children}
      </span>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className={styles.tip}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            <span>{label}</span>
            {shortcut && <Kbd shortcut={shortcut} />}
          </div>,
          document.body,
        )}
    </>
  );
}
