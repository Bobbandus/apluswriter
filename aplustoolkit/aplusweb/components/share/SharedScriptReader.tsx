'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { parse } from '@aplus/fountain/parse';
import type { Element } from '@aplus/fountain/types';
import { getSharedScript, type SharedScript } from '@/lib/sharing';
import styles from './SharedScriptReader.module.css';

/**
 * What a share link opens onto: no editor, no login, just the page.
 *
 * Read-only always, whatever the link's permission — a "can comment" link
 * changes what happens once comments are wired up here, not whether the text
 * can be typed into. There is no client-side way to tell `get_shared_script`
 * "and let me write", because there is no such RPC; the function only ever
 * returns rows.
 *
 * Rendered from the parsed element list rather than the raw Fountain text, so
 * a scene heading and a line of dialogue read like a screenplay instead of a
 * wall of asterisks and dots.
 */
export function SharedScriptReader({ token }: { token: string }) {
  const t = useTranslations('share');
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [script, setScript] = useState<SharedScript | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSharedScript(token)
      .then((result) => {
        if (cancelled) return;
        setScript(result);
        setState(result ? 'ready' : 'notfound');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'loading') {
    return (
      <main className={styles.page}>
        <p className={styles.status}>{t('loading')}</p>
      </main>
    );
  }

  if (state !== 'ready' || !script) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>{t('linkGone')}</p>
      </main>
    );
  }

  const elements = parse(script.content).elements;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          A<span className={styles.plus}>+</span> Toolkit
        </span>
        <h1 className={styles.title}>{script.title}</h1>
        <p className={styles.badge}>{script.permission === 'comment' ? t('permissionComment') : t('permissionView')}</p>
      </header>

      <div className={styles.script}>{elements.map((element) => renderElement(element))}</div>
    </main>
  );
}

function renderElement(element: Element) {
  switch (element.type) {
    case 'sceneHeading':
      return (
        <p key={element.id} className={styles.sceneHeading}>
          {element.text}
        </p>
      );
    case 'character':
      return (
        <p key={element.id} className={styles.character}>
          {element.text}
        </p>
      );
    case 'dialogue':
      return (
        <p key={element.id} className={styles.dialogue}>
          {element.text}
        </p>
      );
    case 'parenthetical':
      return (
        <p key={element.id} className={styles.parenthetical}>
          {element.text}
        </p>
      );
    case 'transition':
      return (
        <p key={element.id} className={styles.transition}>
          {element.text}
        </p>
      );
    case 'section':
      return (
        <p key={element.id} className={styles.section} data-depth={element.depth}>
          {element.text}
        </p>
      );
    case 'centered':
      return (
        <p key={element.id} className={styles.centered}>
          {element.text}
        </p>
      );
    case 'lyrics':
      return (
        <p key={element.id} className={styles.lyrics}>
          {element.text}
        </p>
      );
    case 'action':
      return element.text.trim() ? (
        <p key={element.id} className={styles.action}>
          {element.text}
        </p>
      ) : null;
    // Synopses, notes, the boneyard and page breaks are for the writer, not
    // a reader: they carry no story content of their own.
    default:
      return null;
  }
}
