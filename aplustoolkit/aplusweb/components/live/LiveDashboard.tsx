'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { API_NAMES } from '@aplus/live/api';
import { defaultState, normalizeState } from '@aplus/live/board';
import { DEFAULT_THEMES, THEME_FORMAT, validateTheme } from '@aplus/live/theme';
import { BOARD_KINDS, type BoardKind, type ScoreState, type Side } from '@aplus/live/types';
import { useSession } from '@/lib/storage/hooks';
import { ownerStore } from '@/lib/live/store';
import { LiveError, type LiveStore, type OwnedBoard } from '@/lib/live/types';
import { POSITIONS, type Position } from '@/lib/live/position';
import { BoardView } from './BoardView';
import { Canvas } from './Canvas';
import styles from './LiveDashboard.module.css';

/** The owner's page: make boards, copy their two links, pick or import a theme, name the sides. */
export function LiveDashboard() {
  const t = useTranslations('live.owner');
  const session = useSession();
  const signedIn = Boolean(session.email);
  const store = useMemo<LiveStore>(() => ownerStore(signedIn), [signedIn]);
  const local = !(session.configured && signedIn);

  const [boards, setBoards] = useState<OwnedBoard[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [kind, setKind] = useState<BoardKind>('score');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      setBoards(await store.list());
      setProblem(null);
    } catch (error) {
      setBoards([]);
      setProblem(error instanceof LiveError && error.code === 'notInstalled' ? t('notInstalled') : t('failed'));
    }
  }, [store, t]);

  useEffect(() => {
    if (session.ready) void load();
  }, [session.ready, load]);

  const create = async () => {
    try {
      await store.create(kind, name.trim() || t(`kinds.${kind}`), defaultState(kind));
      setName('');
      await load();
    } catch (error) {
      setProblem(error instanceof LiveError && error.code === 'notInstalled' ? t('notInstalled') : t('failed'));
    }
  };

  return (
    <div className={styles.page}>
      {local && <p className={styles.notice}>{session.configured ? t('signInHint') : t('localOnly')}</p>}
      {problem && <p className={styles.notice}>{problem}</p>}

      <form
        className={styles.create}
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <select className={styles.field} value={kind} onChange={(event) => setKind(event.target.value as BoardKind)} aria-label={t('kind')}>
          {BOARD_KINDS.map((option) => (
            <option key={option} value={option}>
              {t(`kinds.${option}`)}
            </option>
          ))}
        </select>
        <input className={styles.field} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('namePlaceholder')} aria-label={t('name')} />
        <button type="submit" className={styles.primary}>
          {t('create')}
        </button>
      </form>

      {boards?.length === 0 && !problem && <p className={styles.empty}>{t('empty')}</p>}
      <div className={styles.list}>
        {boards?.map((board) => (
          <BoardCard key={board.id} board={board} store={store} local={local} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function BoardCard({ board, store, local, onChanged }: { board: OwnedBoard; store: LiveStore; local: boolean; onChanged: () => Promise<void> }) {
  const t = useTranslations('live.owner');
  const [position, setPosition] = useState<Position>('bl');
  const [themeText, setThemeText] = useState('');
  const [themeErrors, setThemeErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const parsedTheme = validateTheme(board.theme);
  const theme = parsedTheme.ok ? parsedTheme.theme : DEFAULT_THEMES[0]!;
  const state = normalizeState(board.kind, board.state);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const outputLink = `${origin}/live/out/${board.outputToken}?pos=${position}`;
  const controlLink = `${origin}/live/control/${board.controlToken}`;

  const save = async (patch: { name?: string; theme?: unknown; state?: unknown }) => {
    await store.save(board.id, patch);
    await onChanged();
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((current) => (current === label ? null : current)), 1500);
    } catch {
      // Copying is a convenience; the link is on screen to select by hand.
    }
  };

  const importTheme = async () => {
    let json: unknown;
    try {
      json = JSON.parse(themeText);
    } catch {
      return setThemeErrors([t('notJson')]);
    }
    const result = validateTheme(json, theme);
    if (!result.ok) return setThemeErrors(result.errors);
    setThemeErrors([]);
    setThemeText('');
    await save({ theme: result.theme });
  };

  const setSide = (side: Side, field: 'name' | 'color' | 'flag' | 'logo', value: string) => {
    const next = { ...state, [side]: { ...(state as ScoreState)[side], [field]: value } };
    void save({ state: next });
  };

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <input key={board.name} className={styles.titleField} defaultValue={board.name} aria-label={t('name')} onBlur={(event) => event.target.value.trim() && event.target.value !== board.name && void save({ name: event.target.value.trim() })} />
        <span className={styles.kind}>{t(`kinds.${board.kind}`)}</span>
        <button type="button" className={styles.danger} onClick={() => window.confirm(t('removeConfirm')) && void store.remove(board.id).then(onChanged)}>
          {t('remove')}
        </button>
      </header>

      <div className={styles.preview}>
        <Canvas>
          <BoardView kind={board.kind} state={state} theme={theme} position={position} />
        </Canvas>
      </div>

      <div className={styles.links}>
        <label className={styles.linkRow}>
          <span>{t('outputLink')}</span>
          <input className={styles.field} readOnly value={outputLink} onFocus={(event) => event.target.select()} />
          <button type="button" className={styles.btn} onClick={() => void copy('out', outputLink)}>
            {copied === 'out' ? t('copied') : t('copy')}
          </button>
        </label>
        <label className={styles.linkRow}>
          <span>{t('controlLink')}</span>
          <input className={styles.field} readOnly value={controlLink} onFocus={(event) => event.target.select()} />
          <button type="button" className={styles.btn} onClick={() => void copy('ctl', controlLink)}>
            {copied === 'ctl' ? t('copied') : t('copy')}
          </button>
        </label>
        <div className={styles.inline}>
          <label>
            {t('position')}{' '}
            <select className={styles.field} value={position} onChange={(event) => setPosition(event.target.value as Position)}>
              {POSITIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`positions.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <a className={styles.btn} href={controlLink} target="_blank" rel="noreferrer">
            {t('openControl')}
          </a>
        </div>
        {local && <p className={styles.hint}>{t('localBoardHint')}</p>}
      </div>

      <section>
        <h3 className={styles.h}>{t('theme')}</h3>
        <div className={styles.themes}>
          {DEFAULT_THEMES.map((candidate) => (
            <button key={candidate.name} type="button" className={styles.themeBtn} data-on={candidate.name === theme.name} onClick={() => void save({ theme: candidate })}>
              <span className={styles.swatch} style={{ background: `linear-gradient(90deg, ${candidate.primary} 50%, ${candidate.secondary} 50%)` }} />
              {candidate.name}
            </button>
          ))}
        </div>
        <details className={styles.details}>
          <summary>{t('importTheme')}</summary>
          <p className={styles.hint}>{t('importHint')}</p>
          <textarea className={styles.area} value={themeText} onChange={(event) => setThemeText(event.target.value)} placeholder={THEME_FORMAT.split('\n')[1]} rows={6} />
          {themeErrors.length > 0 && (
            <ul className={styles.errors}>
              {themeErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <div className={styles.inline}>
            <button type="button" className={styles.btn} onClick={() => void importTheme()} disabled={!themeText.trim()}>
              {t('useTheme')}
            </button>
            <button type="button" className={styles.btn} onClick={() => void copy('theme', JSON.stringify(theme, null, 2))}>
              {copied === 'theme' ? t('copied') : t('copyTheme')}
            </button>
          </div>
        </details>
      </section>

      {!local && (
        <details className={styles.details}>
          <summary>{t('streamDeck')}</summary>
          <p className={styles.hint}>{t('streamDeckHint')}</p>
          <ul className={styles.apiList}>
            {API_NAMES[board.kind].map((button) => {
              const url = `${origin}/api/live/${board.controlToken}/${button}`;
              return (
                <li key={button}>
                  <code>{button}</code>
                  <button type="button" className={styles.btn} onClick={() => void copy(`api-${button}`, url)}>
                    {copied === `api-${button}` ? t('copied') : t('copy')}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {board.kind !== 'lower' && (
        <section>
          <h3 className={styles.h}>{t('sides')}</h3>
          <div className={styles.sidesGrid}>
            {(['a', 'b'] as const).map((side) => {
              const info = (state as ScoreState)[side];
              return (
                <div key={side} className={styles.sideBox}>
                  <input key={`n${info.name}`} className={styles.field} defaultValue={info.name} aria-label={t('sideName')} onBlur={(event) => event.target.value !== info.name && setSide(side, 'name', event.target.value)} />
                  <input key={`c${info.color}`} className={styles.field} defaultValue={info.color} placeholder={t('colorPlaceholder')} aria-label={t('color')} onBlur={(event) => event.target.value !== info.color && setSide(side, 'color', event.target.value.trim())} />
                  <input key={`f${info.flag}`} className={styles.field} defaultValue={info.flag} placeholder={t('flagPlaceholder')} maxLength={2} aria-label={t('flag')} onBlur={(event) => event.target.value !== info.flag && setSide(side, 'flag', event.target.value.trim().toUpperCase())} />
                  <input key={`l${info.logo}`} className={styles.field} defaultValue={info.logo} placeholder={t('logoPlaceholder')} aria-label={t('logo')} onBlur={(event) => event.target.value !== info.logo && setSide(side, 'logo', event.target.value.trim())} />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </article>
  );
}
