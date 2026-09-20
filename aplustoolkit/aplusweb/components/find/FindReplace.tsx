'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { parse } from '@aplus/fountain/parse';
import {
  findMatches,
  nextMatch,
  previousMatch,
  replaceEdits,
  replacementFor,
  type FindOptions,
  type FindScope,
} from '@aplus/fountain/findReplace';
import styles from './FindReplace.module.css';

export interface FindReplaceProps {
  open: boolean;
  /** Open with the replace row showing (Ctrl+H) rather than search only (Ctrl+F). */
  replaceMode: boolean;
  onReplaceMode: (on: boolean) => void;
  onClose: () => void;
  source: string;
  caret: number;
  /** Index of the scene the caret is in, for the "this scene" scope. */
  sceneIndex: number;
  roles: string[];
  onSelect: (from: number, to: number) => void;
  onApply: (edits: { from: number; to: number; insert: string }[]) => void;
}

/**
 * Find and replace, as a small panel over the page rather than a dialog: the
 * script has to stay visible, since the selected match is how the writer sees
 * where they are. Matches are selected in the editor as the writer types and
 * steps, but the editor keeps its focus, and so does the search field.
 *
 * The scope (whole script, this scene, one role's lines) only shows in replace
 * mode. Searching always covers the whole script, so a scope chosen earlier can
 * never silently narrow a search the writer cannot see it on.
 */
export function FindReplace({ open, replaceMode, onReplaceMode, onClose, source, caret, sceneIndex, roles, onSelect, onApply }: FindReplaceProps) {
  const t = useTranslations('find');
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [scopeKind, setScopeKind] = useState<'all' | 'scene' | 'dialogue'>('all');
  const [role, setRole] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const findRef = useRef<HTMLInputElement>(null);
  // Where the last step landed, so Next means "after this one" even when the caret is elsewhere.
  const cursor = useRef(caret);

  useEffect(() => {
    if (!open) return;
    cursor.current = caret;
    setNote(null);
    findRef.current?.focus();
    findRef.current?.select();
    // Only when opening: the caret moving while stepping must not reset the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const options: FindOptions = useMemo(() => ({ query, caseSensitive, regex, wholeWord }), [query, caseSensitive, regex, wholeWord]);
  const script = useMemo(() => (open ? parse(source) : null), [open, source]);
  const scope: FindScope = useMemo(() => {
    if (!replaceMode || scopeKind === 'all') return { kind: 'all' };
    if (scopeKind === 'scene') return { kind: 'scene', index: Math.max(0, sceneIndex) };
    return { kind: 'dialogue', character: role || roles[0] || '' };
  }, [replaceMode, scopeKind, sceneIndex, role, roles]);

  const result = useMemo(() => (script ? findMatches(script, options, scope) : { matches: [] }), [script, options, scope]);
  const { matches } = result;
  const invalid = Boolean(result.error) && query !== '';

  const land = (target: { from: number; to: number } | null) => {
    if (!target) return;
    // The cursor sits at the end of the match the writer is looking at.
    cursor.current = target.to;
    onSelect(target.from, target.to);
  };

  // Show the first match from where the writer was as they type.
  useEffect(() => {
    if (!open) return;
    land(nextMatch(matches, cursor.current));
    // Selecting must follow the query and options, not every keystroke in the script.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regex, wholeWord, scopeKind, role, open]);

  // After a replace the list is recounted; move on to the match that follows.
  const advance = useRef(false);
  useEffect(() => {
    if (!advance.current) return;
    advance.current = false;
    land(nextMatch(matches, cursor.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  if (!open) return null;

  const current = () => matches.find((match) => match.to === cursor.current) ?? null;

  const step = (direction: 1 | -1) => {
    const here = current();
    land(direction === 1 ? nextMatch(matches, cursor.current) : previousMatch(matches, here ? here.from : cursor.current));
    setNote(null);
  };

  const replaceCurrent = () => {
    const match = current() ?? nextMatch(matches, cursor.current);
    if (!match) return;
    const insert = replacementFor(match, options, replacement);
    cursor.current = match.from + insert.length;
    advance.current = true;
    onApply([{ from: match.from, to: match.to, insert }]);
    setNote(null);
  };

  const replaceAll = () => {
    if (matches.length === 0) return;
    onApply(replaceEdits(matches, options, replacement));
    setNote(t('replaced', { count: matches.length }));
  };

  return (
    <div className={styles.panel} role="search" aria-label={t('title')}>
      <div className={styles.row}>
        <input
          ref={findRef}
          className={styles.input}
          value={query}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          aria-invalid={invalid || undefined}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'Enter') {
              event.preventDefault();
              step(event.shiftKey ? -1 : 1);
            }
          }}
        />
        <span className={styles.count} aria-live="polite">
          {invalid ? t('badRegex') : query ? (matches.length === 0 ? t('none') : t('matches', { count: matches.length })) : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={() => step(-1)} disabled={matches.length === 0} aria-label={t('previous')}>
          ↑
        </Button>
        <Button variant="ghost" size="sm" onClick={() => step(1)} disabled={matches.length === 0} aria-label={t('next')}>
          ↓
        </Button>
        <button type="button" className={styles.chip} aria-pressed={caseSensitive} title={t('caseSensitive')} onClick={() => setCaseSensitive(!caseSensitive)}>
          Aa
        </button>
        <button type="button" className={styles.chip} aria-pressed={wholeWord} title={t('wholeWord')} onClick={() => setWholeWord(!wholeWord)} disabled={regex}>
          ab
        </button>
        <button type="button" className={styles.chip} aria-pressed={regex} title={t('regex')} onClick={() => setRegex(!regex)}>
          .*
        </button>
        <Button variant="ghost" size="sm" icon="close" aria-label={t('close')} onClick={onClose} />
      </div>

      {replaceMode ? (
        <>
          <div className={styles.row}>
            <input
              className={styles.input}
              value={replacement}
              placeholder={t('replacePlaceholder')}
              aria-label={t('replacePlaceholder')}
              onChange={(event) => setReplacement(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  replaceCurrent();
                }
              }}
            />
            <Button variant="ghost" size="sm" onClick={replaceCurrent} disabled={matches.length === 0}>
              {t('replace')}
            </Button>
            <Button variant="primary" size="sm" onClick={replaceAll} disabled={matches.length === 0}>
              {t('replaceAll')}
            </Button>
          </div>
          <div className={styles.row}>
            <select className={styles.select} value={scopeKind} onChange={(event) => setScopeKind(event.target.value as typeof scopeKind)} aria-label={t('scope')}>
              <option value="all">{t('scopeAll')}</option>
              <option value="scene">{t('scopeScene')}</option>
              {roles.length > 0 && <option value="dialogue">{t('scopeRole')}</option>}
            </select>
            {scopeKind === 'dialogue' && (
              <select className={styles.select} value={role || roles[0] || ''} onChange={(event) => setRole(event.target.value)} aria-label={t('scopeRole')}>
                {roles.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            {note && <span className={styles.note}>{note}</span>}
          </div>
        </>
      ) : (
        <div className={styles.row}>
          <Button variant="ghost" size="sm" onClick={() => onReplaceMode(true)}>
            {t('showReplace')}
          </Button>
        </div>
      )}
    </div>
  );
}
