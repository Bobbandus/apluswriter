'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import styles from './InspectorTabs.module.css';

export type InspectorTab = 'scene' | 'todos' | 'suggestions';

export interface InspectorTabsProps {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  /** Cards waiting for the writer. */
  count: number;
  connected: boolean;
  /** Hidden entirely when the writer has cards switched off. */
  showSuggestions: boolean;
  /** Notes left in the script. The tab exists only while there are some. */
  todoCount: number;
  scene: ReactNode;
  todos: ReactNode;
  suggestions: ReactNode;
}

/**
 * Scene facts, things left to do, and Claude's suggestions — one tab each.
 *
 * Two of them are only there when they have something to say. The suggestions
 * tab exists when the writer wants an assistant; the to-do tab exists while
 * the script holds a to-do. A tab that is always present and mostly empty is
 * noise, and this is a place people look at for eight hours a day.
 */
export function InspectorTabs({
  tab,
  onTab,
  count,
  connected,
  showSuggestions,
  todoCount,
  scene,
  todos,
  suggestions,
}: InspectorTabsProps) {
  const t = useTranslations('common');
  const tAssistant = useTranslations('assistant');
  const tTodos = useTranslations('todos');

  const hasTodos = todoCount > 0;
  // A tab that vanishes while it is showing must not leave a blank pane.
  const active: InspectorTab =
    tab === 'todos' && !hasTodos ? 'scene' : tab === 'suggestions' && !showSuggestions ? 'scene' : tab;

  return (
    <div className={styles.shell}>
      {(showSuggestions || hasTodos) && (
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

          {hasTodos && (
            <button
              type="button"
              role="tab"
              aria-selected={active === 'todos'}
              className={styles.tab}
              onClick={() => onTab('todos')}
            >
              <Icon name="todo" size={13} />
              {tTodos('tab')}
              <span className={styles.count}>{todoCount}</span>
            </button>
          )}

          {showSuggestions && (
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
          )}
        </div>
      )}
      <div className={styles.content}>{active === 'scene' ? scene : active === 'todos' ? todos : suggestions}</div>
    </div>
  );
}
