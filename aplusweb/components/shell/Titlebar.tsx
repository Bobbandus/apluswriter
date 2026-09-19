'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { Icon } from '@/components/icons/Icon';
import { isDesktop } from '@/lib/platform';
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
  onOpenCommandPalette: () => void;
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
  onOpenProjectMenu,
  onOpenVersionMenu,
}: TitlebarProps) {
  const t = useTranslations('titlebar');

  // Resolved after mount: the server has no way to know which shell we're in.
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktop()), []);

  return (
    <header className={styles.titlebar}>
      <div className={styles.side + ' ' + styles.left}>
        <div
          className={[styles.lights, desktop ? '' : styles.ornamental].filter(Boolean).join(' ')}
          aria-hidden="true"
        >
          <span className={`${styles.light} ${styles.close}`} />
          <span className={`${styles.light} ${styles.minimize}`} />
          <span className={`${styles.light} ${styles.zoom}`} />
        </div>

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
        <button type="button" className={styles.project} onClick={onOpenProjectMenu}>
          <span className={styles.projectTitle}>{projectTitle}</span>
          <Icon name="chevronDown" size={13} />
        </button>

        {version && (
          <button type="button" className={styles.versionPill} onClick={onOpenVersionMenu}>
            {version}
            <Icon name="chevronDown" size={11} />
          </button>
        )}

        <SaveStatus state={saveState} />
      </div>

      <div className={styles.side + ' ' + styles.right}>
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

        <Tooltip label={t('commandPalette')} shortcut="mod+k">
          <Button
            variant="ghost"
            size="sm"
            icon="command"
            aria-label={t('commandPalette')}
            onClick={onOpenCommandPalette}
          />
        </Tooltip>

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
