'use client';

import { useMemo } from 'react';
import { diffLines, diffStats, hunks } from '@aplus/fountain/diff';
import styles from './DiffView.module.css';

export interface DiffViewProps {
  before: string;
  after: string;
  /** Lines of unchanged context around each change. */
  context?: number;
  /** Shown when the two texts are identical. */
  emptyLabel?: string;
  /** Names for the two sides, shown in the header (e.g. "Molnet" / "Din"). */
  beforeLabel?: string;
  afterLabel?: string;
}

/**
 * What would change, as `-` and `+` lines.
 *
 * Used for sync conflicts, the assistant's formatting fixes and revision
 * compare — every place a writer has to decide between two versions of their
 * own words. Unchanged stretches are folded away; only the changes and a
 * little context are shown.
 */
export function DiffView({ before, after, context = 2, emptyLabel, beforeLabel, afterLabel }: DiffViewProps) {
  const diff = useMemo(() => diffLines(before, after), [before, after]);
  const stats = useMemo(() => diffStats(diff), [diff]);
  const groups = useMemo(() => hunks(diff, context), [diff, context]);

  if (groups.length === 0) return <p className={styles.empty}>{emptyLabel}</p>;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.removed}>
          −{stats.removed}
          {beforeLabel ? ` ${beforeLabel}` : ''}
        </span>
        <span className={styles.added}>
          +{stats.added}
          {afterLabel ? ` ${afterLabel}` : ''}
        </span>
      </div>

      <div className={styles.body}>
        {groups.map((group, g) => (
          <div key={g} className={styles.hunk}>
            {group.lines.map((line, i) => (
              <div key={i} className={styles.line} data-op={line.op}>
                <span className={styles.gutter} aria-hidden="true">
                  {line.op === 'add' ? '+' : line.op === 'remove' ? '−' : ' '}
                </span>
                <span className={styles.number} aria-hidden="true">
                  {line.op === 'add' ? line.newLine : line.oldLine}
                </span>
                <span className={styles.text}>
                  {/* Screen readers need the sign spelled out; sighted users get colour. */}
                  <span className="srOnly">{line.op === 'add' ? '+ ' : line.op === 'remove' ? '− ' : ''}</span>
                  {line.text || ' '}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
