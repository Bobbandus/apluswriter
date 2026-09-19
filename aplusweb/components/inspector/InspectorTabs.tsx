'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import styles from './InspectorTabs.module.css';

export type InspectorTab = 'scene' | 'suggestions';

export interface InspectorTabsProps {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  /** Cards waiting for the writer. */
  count: number;
  connected: boolean;
  /** Hidden entirely when the writer has cards switched off. */
  showSuggestions: boolean;
  scene: ReactNode;
  suggestions: ReactNode;
}

/**
 * Scene facts and Claude's suggestions, one tab each.
 *
 * The suggestions tab only exists when the writer wants it: the app does not
 * advertise an assistant to someone who has turned it off.
 */
export function InspectorTabs({
  tab,
  onTab,
  count,
  connected,
  showSuggestions,
  scene,
  suggestions,
}: InspectorTabsProps) {
  const t = useTranslations('common');
  const tAssistant = useTranslations('assistant');
  const active = showSuggestions ? tab : 'scene';

  return (
    <div className={styles.shell}>
      {showSuggestions && (
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={active === 'scene'}
            className={styles.tab}
            onClick={() => onTab('scene')}
          >
            {t('scene')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={active === 'suggestions'}
            className={styles.tab}
            onClick={() => onTab('suggestions')}
          >
            <Icon name="sparkle" size={13} />
            {tAssistant('tab')}
            {count > 0 && <span className={styles.count}>{count}</span>}
            {connected && count === 0 && <span className={styles.live} aria-label={tAssistant('connected')} />}
          </button>
        </div>
      )}
      <div className={styles.content}>{active === 'scene' ? scene : suggestions}</div>
    </div>
  );
}
