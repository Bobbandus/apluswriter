'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { DEFAULT_LABELS, SLATE_FIELDS, changeRate, logAsText, type SlateField, type SlateState } from '@aplus/shoot/slate';
import { FRAME_RATES, formatTimecode, isFrameRate, parseTimecode } from '@aplus/shoot/timecode';
import styles from './SlatePanel.module.css';

export interface SlatePanelProps {
  open: boolean;
  /** The box that was tapped to get here; its input takes focus. */
  focus: SlateField | null;
  state: SlateState;
  today: string;
  wakeSupported: boolean;
  onChange: (patch: Partial<SlateState>) => void;
  onReplace: (next: SlateState) => void;
  onClose: () => void;
  isSwipeRight: (dx: number, dy: number) => boolean;
  /** Linked to a script: scene and take come from there, and this goes at the top of the panel instead. */
  linked?: LinkedPanel | undefined;
}

/** One clap in a script's take log, as the panel lists it. */
export interface LinkedLogEntry {
  id: string;
  tc: string;
  /** "1A / 3" */
  label: string;
  roll: string;
  at: number;
  note: string;
}

export interface LinkedPanel {
  panel: ReactNode;
  back: string;
  backLabel: string;
  /**
   * The script's own take log, newest first. Linked, the panel lists this and
   * not the slate's: a slate used on its own keeps its own claps, a script
   * keeps its takes, and the two never show in each other's list.
   */
  log: LinkedLogEntry[];
  /** Where the whole log is, to grade and edit takes. */
  logHref: string;
}

type FullscreenDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Fullscreen, including Safari on iPad, which still only has the prefixed calls on older versions. */
const fs = {
  enabled: () => Boolean(document.fullscreenEnabled || (document as FullscreenDoc).webkitFullscreenEnabled),
  active: () => Boolean(document.fullscreenElement || (document as FullscreenDoc).webkitFullscreenElement),
  enter: () => {
    const el = document.documentElement as FullscreenEl;
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  },
  exit: () => {
    if (document.exitFullscreen) void document.exitFullscreen().catch(() => undefined);
    else (document as FullscreenDoc).webkitExitFullscreen?.();
  },
};


/** Everything on the slate, changeable. Slides in from the right; swipe right or tap outside to put it away. */
export function SlatePanel({ open, focus, state, today, wakeSupported, onChange, onReplace, onClose, isSwipeRight, linked }: SlatePanelProps) {
  const t = useTranslations('shoot');
  const locale = useLocale();
  const inputs = useRef<Partial<Record<SlateField, HTMLInputElement | null>>>({});
  const start = useRef({ x: 0, y: 0, active: false });
  const [takeDraft, setTakeDraft] = useState<string | null>(null);
  const [jamText, setJamText] = useState('');
  const [jamError, setJamError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  useEffect(() => {
    if (open && focus) {
      const el = inputs.current[focus];
      el?.focus({ preventScroll: false });
      el?.select();
    }
  }, [open, focus]);

  useEffect(() => {
    setCanFullscreen(fs.enabled());
    const sync = () => setFullscreen(fs.active());
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  // The jam field starts from where the free-run clock was last set.
  useEffect(() => {
    if (open) {
      setJamText(formatTimecode(state.jam?.label ?? 0, state.rate));
      setJamError(false);
    }
    // Only on opening: typing must not be overwritten by the clock.
  }, [open]);

  const onPointerDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const editing = (e.target as HTMLElement).closest('input, textarea, select');
    start.current = { x: e.clientX, y: e.clientY, active: !editing };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    e.stopPropagation();
    if (start.current.active && isSwipeRight(e.clientX - start.current.x, e.clientY - start.current.y)) onClose();
  };

  const setTake = (take: number) => {
    setTakeDraft(null);
    onChange({ take });
  };

  const startJam = () => {
    const label = parseTimecode(jamText, state.rate);
    if (label === null) {
      setJamError(true);
      return;
    }
    setJamError(false);
    setJamText(formatTimecode(label, state.rate));
    onChange({ tcMode: 'jam', jam: { label, at: Date.now() } });
  };

  const toggleFullscreen = () => {
    if (fs.active()) fs.exit();
    else fs.enter();
  };

  const entries: LinkedLogEntry[] = linked
    ? linked.log
    : state.log.map((r) => ({ id: `${r.at}-${r.tc}`, tc: r.tc, label: `${r.scene} / ${r.take}`, roll: r.roll, at: r.at, note: r.note }));

  const copyLog = async () => {
    const text = linked
      ? [['TC', state.labels.roll, `${state.labels.scene} / ${state.labels.take}`, state.labels.note].join('\t'), ...[...entries].reverse().map((e) => [e.tc, e.roll, e.label, e.note].join('\t'))].join('\n')
      : logAsText(state.log, state.labels);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (no HTTPS, or no permission). Nothing sensible to fall back to here.
    }
  };

  const clearLog = () => {
    if (window.confirm(t('clearConfirm'))) onReplace({ ...state, log: [] });
  };

  const field = (name: SlateField) => `slate-${name}`;
  const time = (at: number) => new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <>
      <div className={styles.backdrop} data-open={open || undefined} onClick={onClose} aria-hidden="true" />
      <aside
        className={styles.panel}
        data-open={open || undefined}
        inert={!open}
        aria-label={t('settings')}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <header className={styles.head}>
          <Link href={linked?.back ?? '/shoot'} className={styles.back}>
            ← {linked?.backLabel ?? 'A+ Shoot'}
          </Link>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('close')}>
            ✕
          </button>
        </header>

        {linked?.panel}

        <section className={styles.section}>
          <h2 className={styles.heading}>{t('sectionSlate')}</h2>

          <div className={styles.grid}>
            {(linked ? (['roll'] as const) : (['roll', 'scene'] as const)).map((name) => (
              <label key={name} className={styles.field} htmlFor={field(name)}>
                <span>{t(`field.${name}`)}</span>
                <input
                  id={field(name)}
                  ref={(el) => {
                    inputs.current[name] = el;
                  }}
                  value={state[name]}
                  onChange={(e) => onChange({ [name]: e.target.value })}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </label>
            ))}
          </div>

          {!linked && (
          <div className={styles.field}>
            <label htmlFor={field('take')}>{t('field.take')}</label>
            <div className={styles.stepper}>
              <button type="button" onClick={() => setTake(state.take - 1)} aria-label={t('takeDown')} disabled={state.take <= 1}>
                −
              </button>
              <input
                id={field('take')}
                ref={(el) => {
                  inputs.current.take = el;
                }}
                inputMode="numeric"
                value={takeDraft ?? String(state.take)}
                onChange={(e) => {
                  const text = e.target.value.replace(/\D/g, '');
                  setTakeDraft(text);
                  const n = Number(text);
                  if (text && n >= 1) onChange({ take: n });
                }}
                onBlur={() => setTakeDraft(null)}
                autoComplete="off"
              />
              <button type="button" onClick={() => setTake(state.take + 1)} aria-label={t('takeUp')}>
                +
              </button>
            </div>
          </div>
          )}

          {(['prod', 'dir', 'dop'] as const).map((name) => (
            <label key={name} className={styles.field} htmlFor={field(name)}>
              <span>{t(`field.${name}`)}</span>
              <input
                id={field(name)}
                ref={(el) => {
                  inputs.current[name] = el;
                }}
                value={state[name]}
                onChange={(e) => onChange({ [name]: e.target.value })}
                autoComplete="off"
              />
            </label>
          ))}

          <label className={styles.field} htmlFor={field('note')}>
            <span>{t('field.note')}</span>
            <input
              id={field('note')}
              ref={(el) => {
                inputs.current.note = el;
              }}
              value={state.note}
              onChange={(e) => onChange({ note: e.target.value })}
              autoComplete="off"
            />
          </label>
          <div className={styles.chips}>
            {['MOS', 'PU', 'WILD', 'TAIL', 'NIGHT', 'INT', 'EXT'].map((chip) => (
              <button
                key={chip}
                type="button"
                className={styles.chip}
                data-on={state.note.split(/\s+/).includes(chip) || undefined}
                onClick={() => {
                  const words = state.note.split(/\s+/).filter(Boolean);
                  const next = words.includes(chip) ? words.filter((w) => w !== chip) : [...words, chip];
                  onChange({ note: next.join(' ') });
                }}
              >
                {chip}
              </button>
            ))}
          </div>

          <div className={styles.field}>
            <label htmlFor={field('date')}>{t('field.date')}</label>
            <div className={styles.inline}>
              <input
                id={field('date')}
                ref={(el) => {
                  inputs.current.date = el;
                }}
                value={state.date}
                placeholder={today}
                onChange={(e) => onChange({ date: e.target.value })}
                autoComplete="off"
              />
              <button type="button" className={styles.small} onClick={() => onChange({ date: '' })} disabled={!state.date}>
                {t('today')}
              </button>
            </div>
            <p className={styles.hint}>{t('dateHint')}</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>{t('sectionTimecode')}</h2>

          <label className={styles.field} htmlFor="slate-rate">
            <span>{t('rate')}</span>
            <select
              id="slate-rate"
              value={state.rate}
              onChange={(e) => {
                const rate = e.target.value;
                if (!isFrameRate(rate)) return;
                onChange(changeRate(state, rate, Date.now()));
              }}
            >
              {FRAME_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate === '29.97df' ? '29.97 DF' : rate}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.field}>
            <span>{t('mode')}</span>
            <div className={styles.segmented} role="radiogroup" aria-label={t('mode')}>
              {(['tod', 'jam'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={state.tcMode === mode}
                  data-on={state.tcMode === mode || undefined}
                  onClick={() => onChange(mode === 'jam' && !state.jam ? { tcMode: mode, jam: { label: 0, at: Date.now() } } : { tcMode: mode })}
                >
                  {t(mode === 'tod' ? 'modeTod' : 'modeJam')}
                </button>
              ))}
            </div>
            <p className={styles.hint}>{t(state.tcMode === 'tod' ? 'modeTodHint' : 'modeJamHint')}</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="slate-jam">{t('jamLabel')}</label>
            <div className={styles.inline}>
              <input
                id="slate-jam"
                className={styles.mono}
                value={jamText}
                inputMode="numeric"
                onChange={(e) => {
                  setJamText(e.target.value);
                  setJamError(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && startJam()}
                aria-invalid={jamError}
                autoComplete="off"
              />
              <button type="button" className={styles.small} onClick={startJam}>
                {t('jamStart')}
              </button>
            </div>
            {jamError && <p className={styles.error}>{t('jamInvalid')}</p>}
          </div>

          {!linked && (
          <label className={styles.check}>
            <input type="checkbox" checked={state.autoTake} onChange={(e) => onChange({ autoTake: e.target.checked })} />
            <span>{t('autoTake')}</span>
          </label>
          )}
          <label className={styles.check}>
            <input type="checkbox" checked={state.sound} onChange={(e) => onChange({ sound: e.target.checked })} />
            <span>{t('sound')}</span>
          </label>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>{t('sectionScreen')}</h2>
          {canFullscreen && (
            <button type="button" className={styles.wide} onClick={toggleFullscreen}>
              {t(fullscreen ? 'exitFullscreen' : 'fullscreen')}
            </button>
          )}
          <p className={styles.hint}>{t(wakeSupported ? 'wakeOn' : 'wakeOff')}</p>
          <p className={styles.hint}>{t('keys')}</p>
        </section>

        <section className={styles.section}>
          <div className={styles.headingRow}>
            <h2 className={styles.heading}>
              {t(linked ? 'sectionTakes' : 'sectionLog')} <span className={styles.count}>{entries.length}</span>
            </h2>
            <div className={styles.inline}>
              <button type="button" className={styles.small} onClick={copyLog} disabled={!entries.length}>
                {t(copied ? 'copied' : 'copyLog')}
              </button>
              {linked ? (
                <Link href={linked.logHref} className={styles.small} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                  {t('allTakes')} →
                </Link>
              ) : (
                <button type="button" className={styles.small} onClick={clearLog} disabled={!state.log.length}>
                  {t('clearLog')}
                </button>
              )}
            </div>
          </div>
          {linked && <p className={styles.hint}>{t('takesHint')}</p>}
          {entries.length === 0 ? (
            <p className={styles.hint}>{t('logEmpty')}</p>
          ) : (
            <ol className={styles.log}>
              {entries.slice(0, 100).map((r) => (
                <li key={r.id}>
                  <span className={styles.mono}>{r.tc || '—'}</span>
                  <span>{r.label}</span>
                  <span className={styles.faint}>{r.roll}</span>
                  <span className={styles.faint}>{time(r.at)}</span>
                  {r.note && <span className={styles.logNote}>{r.note}</span>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.section}>
          <details>
            <summary className={styles.heading}>{t('sectionLabels')}</summary>
            <p className={styles.hint}>{t('labelsHint')}</p>
            <div className={styles.grid}>
              {SLATE_FIELDS.map((name) => (
                <label key={name} className={styles.field}>
                  <span>{t(`field.${name}`)}</span>
                  <input
                    value={state.labels[name]}
                    placeholder={DEFAULT_LABELS[name]}
                    onChange={(e) => onChange({ labels: { ...state.labels, [name]: e.target.value } })}
                    autoComplete="off"
                  />
                </label>
              ))}
            </div>
            <button type="button" className={styles.small} onClick={() => onChange({ labels: { ...DEFAULT_LABELS } })}>
              {t('resetLabels')}
            </button>
          </details>
        </section>
      </aside>
    </>
  );
}
