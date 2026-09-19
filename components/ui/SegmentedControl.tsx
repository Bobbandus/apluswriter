'use client';

import { useCallback, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '@/components/icons/Icon';
import styles from './SegmentedControl.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Labels the group for screen readers. */
  label: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

/**
 * A macOS-style segmented control.
 *
 * Implemented as a radiogroup so arrow keys move between options and the
 * whole control is one tab stop — the same as the native one.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const move = useCallback(
    (delta: number) => {
      const count = options.length;
      // Skip over disabled options rather than landing on them.
      for (let step = 1; step <= count; step += 1) {
        const next = options[(index + delta * step + count * count) % count];
        if (next && !next.disabled) {
          onChange(next.value);
          return;
        }
      }
    },
    [index, options, onChange],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        move(1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        move(-1);
      }
    },
    [move],
  );

  const widthPct = 100 / options.length;

  const classes = [styles.root, size === 'sm' && styles.sm, fullWidth && styles.fullWidth, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div role="radiogroup" aria-label={label} className={classes} onKeyDown={onKeyDown}>
      <span
        className={styles.thumb}
        aria-hidden="true"
        style={{
          width: `calc(${widthPct}% - 2px)`,
          transform: `translateX(calc(${index * 100}% + ${index * 2}px))`,
        }}
      />
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            // Only the selected option is in the tab order; arrows do the rest.
            tabIndex={checked ? 0 : -1}
            disabled={option.disabled ?? false}
            className={styles.option}
            onClick={() => onChange(option.value)}
          >
            {option.icon && <Icon name={option.icon} size={size === 'sm' ? 13 : 15} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
