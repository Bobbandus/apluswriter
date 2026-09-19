'use client';

import { useId } from 'react';
import styles from './Toggle.module.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** The line of explanation under the label. Worth writing for any setting
   *  whose effect isn't obvious from its name alone. */
  hint?: string;
  disabled?: boolean;
  className?: string;
}

/** A settings row with a macOS-style switch on the right. */
export function Toggle({ checked, onChange, label, hint, disabled = false, className }: ToggleProps) {
  const labelId = useId();
  const hintId = useId();

  return (
    <div className={[styles.row, className].filter(Boolean).join(' ')}>
      <div className={styles.text}>
        <label
          id={labelId}
          className={styles.label}
          onClick={() => !disabled && onChange(!checked)}
        >
          {label}
        </label>
        {hint && (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} aria-hidden="true" />
      </button>
    </div>
  );
}
