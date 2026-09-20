'use client';

import { useTranslations } from 'next-intl';
import { Panel } from '@/components/ui/Panel';
import type { SceneIndexEntry } from '@aplus/fountain/types';
import styles from './TodoPanel.module.css';

export interface TodoItem {
  text: string;
  from: number;
  to: number;
  sceneId: string | null;
}

export interface TodoPanelProps {
  todos: TodoItem[];
  scenes: SceneIndexEntry[];
  /** Put the caret on the note. */
  onReveal: (todo: TodoItem) => void;
  /** Take the note out of the script. */
  onDone: (todo: TodoItem) => void;
}

/**
 * Everything the script has been told to remember, in the order it was left.
 *
 * The notes are lines in the file, so this is a list of what is already
 * there rather than a second list to keep in step. Ticking one deletes its
 * `[[todo:]]` — which is also how the export warning stops nagging.
 */
export function TodoPanel({ todos, scenes, onReveal, onDone }: TodoPanelProps) {
  const t = useTranslations('todos');

  return (
    <Panel title={t('title')}>
      <ul className={styles.list}>
        {todos.map((todo) => {
          const scene = scenes.find((candidate) => candidate.id === todo.sceneId);
          return (
            <li key={`${todo.from}:${todo.text}`} className={styles.item}>
              <input
                type="checkbox"
                className={styles.check}
                checked={false}
                aria-label={t('done', { text: todo.text })}
                onChange={() => onDone(todo)}
              />
              <button type="button" className={styles.body} onClick={() => onReveal(todo)}>
                <span className={styles.text}>{todo.text}</span>
                {scene && <span className={styles.where}>{scene.heading}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className={styles.hint}>{t('hint')}</p>
    </Panel>
  );
}
