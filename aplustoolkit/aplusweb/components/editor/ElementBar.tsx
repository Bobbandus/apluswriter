'use client';

import { useTranslations } from 'next-intl';
import { Icon, type IconName } from '@/components/icons/Icon';
import type { SwitchableType } from '@aplus/fountain/rewrite';
import type { LineType } from '@aplus/fountain/lineClassify';
import styles from './ElementBar.module.css';

/**
 * The element bar: what the caret is in, and how to change it.
 *
 * It sits above the page, never on it — the paper is for the script. It does
 * two jobs at once: it *shows* the current element (so a writer can see that
 * the line they are on reads as dialogue), and it *switches* it on click or
 * Ctrl/Cmd+1–8. A switch the writer can see happening is one they trust.
 */

const ELEMENTS: { type: SwitchableType; key: string; icon: IconName }[] = [
  { type: 'sceneHeading', key: '1', icon: 'elScene' },
  { type: 'action', key: '2', icon: 'elAction' },
  { type: 'character', key: '3', icon: 'elCharacter' },
  { type: 'dialogue', key: '4', icon: 'elDialogue' },
  { type: 'parenthetical', key: '5', icon: 'elParenthetical' },
  { type: 'transition', key: '6', icon: 'elTransition' },
  { type: 'section', key: '7', icon: 'elSection' },
  { type: 'synopsis', key: '8', icon: 'elSynopsis' },
];

export interface ElementBarProps {
  current: LineType | null;
  onChoose: (type: SwitchableType) => void;
}

export function ElementBar({ current, onChoose }: ElementBarProps) {
  const t = useTranslations('elements');
  const tEditor = useTranslations('editor');

  return (
    <div className={styles.bar} role="toolbar" aria-label={tEditor('elementPicker')}>
      {ELEMENTS.map(({ type, key, icon }) => {
        const active = current === type;
        return (
          <button
            key={type}
            type="button"
            className={styles.button}
            aria-pressed={active}
            title={`${t(type)} — Ctrl/Cmd+${key}`}
            // Keep focus in the editor, so the caret never leaves the line
            // being switched.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChoose(type)}
          >
            {/* The digit is the shortcut. It stays visible at every width, so
                the bar teaches Ctrl/Cmd+1–8 just by being looked at. */}
            <span className={styles.key}>{key}</span>
            <Icon name={icon} size={15} />
            <span className={styles.label}>{t(type)}</span>
          </button>
        );
      })}
    </div>
  );
}
