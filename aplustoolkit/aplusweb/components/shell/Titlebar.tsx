'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { Icon } from '@/components/icons/Icon';
import { SaveStatus, type SaveState } from './SaveStatus';
import styles from './Titlebar.module.css';

export interface TitlebarProps {
  projectTitle: string;
  /** The current revision label, shown in the version pill. */
  version?: string | undefined;
  saveState: SaveState | null;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  focusMode: boolean;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onToggleFocus: () => void;
  /** Left out until the palette exists; the button is hidden rather than dead. */
  onOpenCommandPalette?: (() => void) | undefined;
  onExport?: () => void;
  /** The script, or the same scenes as index cards. Left out, the toggle is not drawn. */
  view?: 'script' | 'cards' | undefined;
  onViewChange?: ((view: 'script' | 'cards') => void) | undefined;
  /** Back to all projects. */
  onHome?: () => void;
  onOpenProjectMenu?: () => void;
  onOpenVersionMenu?: () => void;
}

/**
 * The app's own titlebar.
 *
 * On the web this is an ordinary strip with ornamental traffic lights holding
 * the macOS proportions. Under Electron the window is frameless, the real
 * lights sit in the same gutter, and the strip becomes the drag region — which
 * is why the spacing is reserved either way.
 */
export function Titlebar({
  projectTitle,
  version,
  saveState,
  sidebarOpen,
  inspectorOpen,
  focusMode,
  onToggleSidebar,
  onToggleInspector,
  onToggleFocus,
  onOpenCommandPalette,
  onExport,
  view,
  onViewChange,
  onHome,
  onOpenProjectMenu,
  onOpenVersionMenu,
}: TitlebarProps) {
  const t = useTranslations('titlebar');


  return (
    <header className={styles.titlebar}>
      <div className={styles.side + ' ' + styles.left}>
        {/* Room for the real macOS window controls in the desktop app; nothing on the web. */}
        <div className={styles.gutter} aria-hidden="true" />

        {onHome && (
          <Tooltip label={t('projects')}>
            <Button variant="ghost" size="sm" icon="folder" aria-label={t('projects')} onClick={onHome} />
          </Tooltip>
        )}

        <Tooltip label={t('toggleSidebar')} shortcut="mod+1">
          <Button
            variant="ghost"
            size="sm"
            icon="sidebarLeft"
            aria-pressed={sidebarOpen}
            aria-label={t('toggleSidebar')}
            onClick={onToggleSidebar}
          />
        </Tooltip>
      </div>

      <div className={styles.center}>
        {/* A chevron promises a menu. Until there is one, the title is just
            the title — a control that does nothing is worse than no control. */}
        {onOpenProjectMenu ? (
          <button type="button" className={styles.project} onClick={onOpenProjectMenu}>
            <span className={styles.projectTitle}>{projectTitle}</span>
            <Icon name="chevronDown" size={13} />
          </button>
        ) : (
          <span className={styles.project}>
            <span className={styles.projectTitle}>{projectTitle}</span>
          </span>
        )}

        {version && (
          <button type="button" className={styles.versionPill} onClick={onOpenVersionMenu}>
            {version}
            <Icon name="chevronDown" size={11} />
          </button>
        )}

        <SaveStatus state={saveState} />
      </div>

      <div className={styles.side + ' ' + styles.right}>
        {view && onViewChange && (
          <Tooltip label={t('cards')}>
            <Button
              variant="ghost"
              size="sm"
              icon="cards"
              aria-pressed={view === 'cards'}
              aria-label={t('cards')}
              onClick={() => onViewChange(view === 'cards' ? 'script' : 'cards')}
            />
          </Tooltip>
        )}

        {onExport && (
          <Tooltip label={t('export')} shortcut="mod+e">
            <Button variant="ghost" size="sm" icon="export" aria-label={t('export')} onClick={onExport} />
          </Tooltip>
        )}

        <Tooltip label={t('focusMode')} shortcut="mod+shift+f">
          <Button
            variant="ghost"
            size="sm"
            icon="focus"
            aria-pressed={focusMode}
            aria-label={t('focusMode')}
            onClick={onToggleFocus}
          />
        </Tooltip>

        {onOpenCommandPalette && (
          <Tooltip label={t('commandPalette')} shortcut="mod+k">
            <Button
              variant="ghost"
              size="sm"
              icon="command"
              aria-label={t('commandPalette')}
              onClick={onOpenCommandPalette}
            />
          </Tooltip>
        )}

        <span className={styles.divider} aria-hidden="true" />

        <Tooltip label={t('toggleInspector')} shortcut="mod+2">
          <Button
            variant="ghost"
            size="sm"
            icon="sidebarRight"
            aria-pressed={inspectorOpen}
            aria-label={t('toggleInspector')}
            onClick={onToggleInspector}
          />
        </Tooltip>
      </div>
    </header>
  );
}
