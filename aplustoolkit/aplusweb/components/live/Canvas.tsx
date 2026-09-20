'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** The size every overlay is designed at. Everything is drawn at this size and then scaled to fit. */
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

/**
 * A 1920×1080 canvas, scaled to fit whatever it is put in.
 *
 * The overlays are drawn in pixels at full HD, the way a broadcast graphic is, and this scales the whole picture
 * instead of each design having its own idea of "small". So the operator's preview, the owner's picker and
 * OBS's browser source (at any size) all show exactly the same thing, only smaller or larger.
 */
export function Canvas({ children, background }: { children: ReactNode; background?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, left: 0, top: 0 });

  useLayoutEffect(() => {
    const element = outer.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const scale = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT);
      setBox({ scale, left: (width - CANVAS_WIDTH * scale) / 2, top: (height - CANVAS_HEIGHT * scale) / 2 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...(background ? { background } : {}) }}>
      <div
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `scale(${box.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
}
