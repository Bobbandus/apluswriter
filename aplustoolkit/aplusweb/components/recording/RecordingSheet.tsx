'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { clockFor, dayPart, gameTimeFor, recordingLog } from '@aplus/production/minecraft';
import type { SceneIndexEntry } from '@aplus/fountain/types';
import styles from './RecordingSheet.module.css';

export type RecordingField = 'time' | 'server' | 'recording' | 'take' | 'at' | 'pov';

export interface RecordingSheetProps {
  open: boolean;
  onClose: () => void;
  scenes: SceneIndexEntry[];
  /** Everyone who speaks, for saying who plays them. */
  roles: string[];
  players: Record<string, string>;
  onPlayers: (next: Record<string, string>) => void;
  /** Sets, or with null removes, one recording note under a scene heading. */
  onSet: (sceneIndex: number, field: RecordingField, value: string | null) => void;
  onExportVoice: () => void;
}

/** Whether what was typed is a value the field can hold. Anything else is put back by the redraw. */
function valid(field: RecordingField, value: string): boolean {
  if (field === 'time') return /^\d{1,5}$/.test(value) && Number(value) < 24000;
  if (field === 'take') return /^\d{1,3}$/.test(value) && Number(value) >= 1;
  if (field === 'at') return /^\d{1,3}:\d{2}(?::\d{2})?$/.test(value);
  return true;
}

/**
 * The recording side of a script that is shot in a game and cut afterwards: which server and recording
 * each scene is on, which take, where in the file it starts, the game clock, whose view it is. All of it
 * lives in the script as notes under the scene heading, so this is only a quieter way to write them.
 */
export function RecordingSheet({ open, onClose, scenes, roles, players, onPlayers, onSet, onExportVoice }: RecordingSheetProps) {
  const t = useTranslations('recording');
  const log = useMemo(() => recordingLog(scenes), [scenes]);

  const commit = (index: number, field: RecordingField, raw: string) => {
    const text = raw.replace(/\]\]/g, '').replace(/\s+/g, ' ').trim();
    if (text === '') return onSet(index, field, null);
    if (valid(field, text)) onSet(index, field, text);
  };

  const cells: { field: RecordingField; label: string; narrow?: boolean }[] = [
    { field: 'time', label: t('time'), narrow: true },
    { field: 'server', label: t('server') },
    { field: 'recording', label: t('recordingName') },
    { field: 'take', label: t('take'), narrow: true },
    { field: 'at', label: t('at'), narrow: true },
    { field: 'pov', label: t('pov') },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t('title')} width={780}>
      <div className={styles.body}>
        <p className={styles.hint}>{t('hint')}</p>

        <div className={styles.scroll}>
          <div className={styles.table}>
            <span className={styles.head}>{t('scene')}</span>
            {cells.map((cell) => (
              <span key={cell.field} className={styles.head}>
                {cell.label}
              </span>
            ))}

            {scenes.map((scene, index) => {
              const suggested = gameTimeFor(scene.timeOfDay);
              return (
                <Row
                  key={scene.id}
                  label={`${index + 1}  ${scene.heading}`}
                >
                  {cells.map((cell) => {
                    const value = scene.meta[cell.field];
                    return (
                      <input
                        // Uncontrolled and keyed on what is in the text: typing is free, and the
                        // field redraws from the script once the note has changed.
                        key={`${cell.field}${value ?? ''}`}
                        className={cell.narrow ? styles.narrow : styles.input}
                        defaultValue={value ?? ''}
                        placeholder={cell.field === 'time' && suggested !== null ? String(suggested) : ''}
                        title={cell.field === 'time' && typeof scene.meta.time === 'number' ? `${clockFor(scene.meta.time)} · ${t(`part.${dayPart(scene.meta.time)}`)}` : undefined}
                        aria-label={`${cell.label}, ${t('sceneNumber', { scene: index + 1 })}`}
                        onBlur={(event) => commit(index, cell.field, event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                      />
                    );
                  })}
                </Row>
              );
            })}
          </div>
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('log')}</h3>
          {log.every((group) => group.recording === null) ? (
            <p className={styles.hint}>{t('logEmpty')}</p>
          ) : (
            <ul className={styles.log}>
              {log.map((group) => (
                <li key={group.recording ?? '-'} className={group.recording === null ? styles.todo : undefined}>
                  <strong>{group.recording ?? t('notRecorded')}</strong>
                  <span>{t('sceneCount', { count: group.scenes.length })}</span>
                  <span className={styles.scenes}>{group.scenes.map((scene) => scene.index + 1).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {roles.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('players')}</h3>
            <p className={styles.hint}>{t('playersHint')}</p>
            <div className={styles.players}>
              {roles.map((role) => (
                <label key={role} className={styles.player}>
                  <span>{role}</span>
                  <input
                    key={`${role}${players[role] ?? ''}`}
                    className={styles.input}
                    defaultValue={players[role] ?? ''}
                    onBlur={(event) => {
                      const name = event.target.value.trim();
                      const next = { ...players };
                      if (name) next[role] = name;
                      else delete next[role];
                      if (JSON.stringify(next) !== JSON.stringify(players)) onPlayers(next);
                    }}
                    onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                  />
                </label>
              ))}
            </div>
            <div>
              <Button variant="secondary" icon="export" onClick={onExportVoice}>
                {t('exportVoice')}
              </Button>
            </div>
          </section>
        )}
      </div>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className={styles.scene}>{label}</span>
      {children}
    </>
  );
}
