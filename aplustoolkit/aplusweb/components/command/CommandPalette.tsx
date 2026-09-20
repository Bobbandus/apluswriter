'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { rankCommands, type Command } from '@/lib/commands';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import styles from './CommandPalette.module.css';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

const RECENT_LIMIT = 4;

/**
 * Type to find anything: a scene, a sheet, a view. Arrow keys and Enter, Esc to
 * leave. Focus stays in the field the whole time (the list is driven with
 * `aria-activedescendant`), so a writer can type, arrow and hit Enter without
 * the hands ever leaving the keys.
 */
export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const t = useTranslations('command');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = usePersistentState<string[]>('aplus.command.recent', []);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Start clean each time. Yesterday's query is not what anyone wants today.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  const shown = useMemo(() => {
    if (query.trim()) return rankCommands(commands, query).slice(0, 50);
    // Nothing typed: what was used last first, then everything in its own groups.
    const used = recent.flatMap((id) => commands.find((c) => c.id === id) ?? []);
    const usedIds = new Set(used.map((c) => c.id));
    return [...used.map((c) => ({ ...c, group: t('recent') })), ...commands.filter((c) => !usedIds.has(c.id))];
  }, [commands, query, recent, t]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, shown]);

  if (!open || typeof document === 'undefined') return null;

  const run = (command: Command) => {
    const original = commands.find((c) => c.id === command.id) ?? command;
    // Scenes are many and change; only the fixed commands are worth remembering.
    if (!original.id.startsWith('scene:')) {
      setRecent([original.id, ...recent.filter((id) => id !== original.id)].slice(0, RECENT_LIMIT));
    }
    onClose();
    original.run();
  };

  let lastGroup = '';

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label={t('placeholder')}>
        <input
          ref={inputRef}
          className={styles.input}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={shown[active] ? `command-${shown[active]!.id}` : undefined}
          placeholder={t('placeholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, shown.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && shown[active]) {
              event.preventDefault();
              run(shown[active]!);
            }
          }}
        />

        {shown.length === 0 ? (
          <p className={styles.empty}>{t('noResults')}</p>
        ) : (
          <ul ref={listRef} id="command-list" role="listbox" className={styles.list}>
            {shown.map((command, index) => {
              const heading = !query.trim() && command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <li key={command.id} role="presentation">
                  {heading && <div className={styles.group}>{heading}</div>}
                  <div
                    id={`command-${command.id}`}
                    role="option"
                    aria-selected={index === active}
                    className={styles.item}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(command)}
                  >
                    <span className={styles.label}>{command.label}</span>
                    {command.shortcut && <span className={styles.shortcut}>{formatShortcut(command.shortcut)}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** `mod+e` as it reads on this machine. */
function formatShortcut(shortcut: string): string {
  const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  return shortcut
    .split('+')
    .map((key) => (key === 'mod' ? (mac ? '⌘' : 'Ctrl') : key.length === 1 ? key.toUpperCase() : key))
    .join(mac ? '' : '+');
}
