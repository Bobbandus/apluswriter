'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons/Icon';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon from the A+ set. */
  icon?: IconName;
  /** Trailing icon — a chevron on a menu button, for example. */
  trailingIcon?: IconName;
  children?: ReactNode;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    trailingIcon,
    children,
    className,
    type = 'button',
    ...rest
  },
  ref,
) {
  const iconOnly = children === undefined || children === null || children === false;

  const classes = [styles.button, styles[variant], styles[size], iconOnly && styles.iconOnly, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} size={ICON_SIZE[size]} />}
      {!iconOnly && <span className={styles.label}>{children}</span>}
      {trailingIcon && <Icon name={trailingIcon} size={ICON_SIZE[size]} />}
    </button>
  );
});
