'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
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
}


/** Everything on the slate, changeable. Slides in from the right; swipe right or tap outside to put it away. */
export function SlatePanel({ open, focus, state, today, wakeSupported, onChange, onReplace, onClose, isSwipeRight }: SlatePanelProps) {
  const t = useTranslations('shoot');
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
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
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
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(logAsText(state.log, state.labels));
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
  const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
          <Link href="/shoot" className={styles.back}>
            ← A+ Shoot
          </Link>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('close')}>
            ✕
          </button>
        </header>

        <section className={styles.section}>
          <h2 className={styles.heading}>{t('sectionSlate')}</h2>

          <div className={styles.grid}>
            {(['roll', 'scene'] as const).map((name) => (
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

          <label className={styles.check}>
            <input type="checkbox" checked={state.autoTake} onChange={(e) => onChange({ autoTake: e.target.checked })} />
            <span>{t('autoTake')}</span>
          </label>
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
              {t('sectionLog')} <span className={styles.count}>{state.log.length}</span>
            </h2>
            <div className={styles.inline}>
              <button type="button" className={styles.small} onClick={copyLog} disabled={!state.log.length}>
                {t(copied ? 'copied' : 'copyLog')}
              </button>
              <button type="button" className={styles.small} onClick={clearLog} disabled={!state.log.length}>
                {t('clearLog')}
              </button>
            </div>
          </div>
          {state.log.length === 0 ? (
            <p className={styles.hint}>{t('logEmpty')}</p>
          ) : (
            <ol className={styles.log}>
              {state.log.slice(0, 100).map((r) => (
                <li key={`${r.at}-${r.tc}`}>
                  <span className={styles.mono}>{r.tc}</span>
                  <span>
                    {r.scene} / {r.take}
                  </span>
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
