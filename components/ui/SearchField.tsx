'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import styles from './SearchField.module.css';

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onValueChange, placeholder, className, ...rest },
  ref,
) {
  const t = useTranslations('common');

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <Icon name="search" size={14} className={styles.icon} />
      <input
        ref={ref}
        type="search"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        // Escape clears the field before it reaches any surrounding dialog.
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.stopPropagation();
            onValueChange('');
          }
        }}
        {...rest}
      />
      {value && (
        <button
          type="button"
          className={styles.clear}
          aria-label={t('close')}
          onClick={() => onValueChange('')}
        >
          <Icon name="close" size={11} />
        </button>
      )}
    </div>
  );
});
