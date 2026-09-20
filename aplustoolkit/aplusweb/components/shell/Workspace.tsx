'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { Titlebar } from './Titlebar';
import type { SaveState } from './SaveStatus';
import { readFocusPrefs, TOGGLE_FOCUS_EVENT } from '@/lib/focusPrefs';
import { useShortcuts } from '@/lib/shortcuts';
import { FocusModeContext } from './FocusModeContext';
import styles from './Workspace.module.css';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;

export interface WorkspaceProps {
  projectTitle: string;
  version?: string | undefined;
  saveState: SaveState | null;
  sidebar: ReactNode;
  inspector: ReactNode;
  children: ReactNode;
  onOpenCommandPalette?: () => void;
  onExport?: () => void;
  view?: 'script' | 'cards';
  onViewChange?: (view: 'script' | 'cards') => void;
  onOpenVersionMenu?: () => void;
  onHome?: () => void;
  /** Passed on to the title bar, next to the save status. */
  status?: ReactNode;
}

/**
 * The three-pane shell: navigator, page canvas, inspector.
 *
 * Pane widths and open state persist per device. Focus mode collapses both
 * side panes without unmounting them, so coming back out restores scroll
 * position and selection exactly.
 */
export function Workspace({
  projectTitle,
  version,
  saveState,
  sidebar,
  inspector,
  children,
  onOpenCommandPalette,
  onExport,
  view,
  onViewChange,
  onOpenVersionMenu,
  onHome,
  status,
}: WorkspaceProps) {
  const t = useTranslations('a11y');
  const tNav = useTranslations('navigator');
  const tInspect = useTranslations('titlebar');

  const [sidebarOpen, setSidebarOpen] = usePersistentState('aplus.ui.sidebarOpen', true);
  const [inspectorOpen, setInspectorOpen] = usePersistentState('aplus.ui.inspectorOpen', true);
  const [sidebarWidth, setSidebarWidth] = usePersistentState('aplus.ui.sidebarWidth', 268);
  const [focusMode, setFocusMode] = useState(false);
  // On a phone the panes are overlays, and a script is opened to write: they start closed and
  // are opened on purpose, without touching what the writer chose for the desktop layout.
  const [narrow, setNarrow] = useState(false);
  const [mobilePane, setMobilePane] = useState<'sidebar' | 'inspector' | null>(null);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  // A writer who wants every script to open in focus mode says so once.
  useEffect(() => {
    if (readFocusPrefs().startInFocus) setFocusMode(true);
  }, []);

  useEffect(() => {
    const toggle = () => setFocusMode((v) => !v);
    window.addEventListener(TOGGLE_FOCUS_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_FOCUS_EVENT, toggle);
  }, []);

  // In focus mode the titlebar fades out and comes back when the pointer nears the top edge.
  const [edgeHover, setEdgeHover] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  /* ------------------------------------------------------------- resizing */

  const startDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }, []);

  const onDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragging) return;
      const left = rootRef.current?.getBoundingClientRect().left ?? 0;
      const next = Math.round(event.clientX - left);
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, next)));
    },
    [dragging, setSidebarWidth],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }, []);

  // The resizer is a real control, so it takes arrow keys too.
  const onResizerKey = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 32 : 8;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSidebarWidth((w) => Math.max(SIDEBAR_MIN, w - step));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSidebarWidth((w) => Math.min(SIDEBAR_MAX, w + step));
      }
    },
    [setSidebarWidth],
  );

  /* ------------------------------------------------------------ shortcuts */

  const toggleSidebar = useCallback(
    () => (narrow ? setMobilePane((pane) => (pane === 'sidebar' ? null : 'sidebar')) : setSidebarOpen((v) => !v)),
    [narrow, setSidebarOpen],
  );
  const toggleInspector = useCallback(
    () => (narrow ? setMobilePane((pane) => (pane === 'inspector' ? null : 'inspector')) : setInspectorOpen((v) => !v)),
    [narrow, setInspectorOpen],
  );
  const toggleFocus = useCallback(() => setFocusMode((v) => !v), []);

  const shortcuts = useShortcuts();
  useHotkeys({
    [shortcuts.binding('sidebar')]: toggleSidebar,
    [shortcuts.binding('inspector')]: toggleInspector,
    [shortcuts.binding('focus')]: toggleFocus,
    [shortcuts.binding('palette')]: () => onOpenCommandPalette?.(),
  });

  // Escape leaves focus mode — the one way out that needs no chrome to find.
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  useEffect(() => {
    if (!focusMode) {
      setEdgeHover(false);
      return;
    }
    const onMove = (event: PointerEvent) => setEdgeHover(event.clientY < 56);
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [focusMode]);

  /* --------------------------------------------------------------- render */

  const showSidebar = (narrow ? mobilePane === 'sidebar' : sidebarOpen) && !focusMode;
  const showInspector = (narrow ? mobilePane === 'inspector' : inspectorOpen) && !focusMode;

  const classes = [
    styles.workspace,
    !showSidebar && styles.sidebarClosed,
    !showInspector && styles.inspectorClosed,
    focusMode && styles.focusMode,
    // A save that failed is the one thing focus mode may not hide.
    focusMode && (edgeHover || saveState === 'error' || saveState === 'conflict') && styles.chromeShown,
    dragging && styles.resizing,
    showSidebar && styles.sidebarOpenMobile,
    showInspector && styles.inspectorOpenMobile,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={classes}
      style={{ ['--sidebar-w' as string]: `${sidebarWidth}px` }}
    >
      <Titlebar
        projectTitle={projectTitle}
        version={version}
        saveState={saveState}
        sidebarOpen={showSidebar}
        inspectorOpen={showInspector}
        onToggleSidebar={toggleSidebar}
        onToggleInspector={toggleInspector}
        {...(onOpenCommandPalette ? { onOpenCommandPalette } : {})}
        {...(onExport ? { onExport } : {})}
        {...(view && onViewChange ? { view, onViewChange } : {})}
        {...(onOpenVersionMenu ? { onOpenVersionMenu } : {})}
        {...(onHome ? { onHome } : {})}
        {...(status ? { status } : {})}
      />

      <nav
        className={[styles.sidebar, showSidebar ? '' : styles.hidden].filter(Boolean).join(' ')}
        aria-label={tNav('title')}
        aria-hidden={!showSidebar}
        // A hidden pane must leave the tab order, not just the viewport.
        inert={!showSidebar}
      >
        {sidebar}
        <button
          type="button"
          className={styles.resizer}
          data-dragging={dragging}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onResizerKey}
          role="separator"
          aria-orientation="vertical"
          aria-label={tNav('title')}
          aria-valuenow={sidebarWidth}
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          tabIndex={0}
        />
      </nav>

      <main className={styles.main}>
        <a href="#script" className="srOnly">
          {t('skipToEditor')}
        </a>
        <FocusModeContext.Provider value={focusMode}>{children}</FocusModeContext.Provider>
      </main>

      <aside
        className={[styles.inspector, showInspector ? '' : styles.hidden].filter(Boolean).join(' ')}
        aria-label={tInspect('toggleInspector')}
        aria-hidden={!showInspector}
        inert={!showInspector}
      >
        {inspector}
      </aside>
    </div>
  );
}
