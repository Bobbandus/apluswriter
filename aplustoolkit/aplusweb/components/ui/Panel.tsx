'use client';

import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons/Icon';
import styles from './Panel.module.css';

export interface PanelProps {
  title: string;
  /** Controls shown at the right of the panel header. */
  actions?: ReactNode;
  /** Pinned below the scroll region — a filter field, usually. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A sidebar or inspector panel: fixed header, scrolling body, optional footer. */
export function Panel({ title, actions, footer, children, className }: PanelProps) {
  return (
    <section className={[styles.panel, className].filter(Boolean).join(' ')}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>

      <div className={styles.body}>{children}</div>

      {footer && <div className={styles.footer}>{footer}</div>}
    </section>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** One line explaining how the writer makes this panel fill up. */
  hint?: string;
}

/**
 * What a panel shows before there is anything in it.
 *
 * These always say what to *do*, never just that something is missing — an
 * empty navigator is the app's only chance to teach that a scene heading is
 * what creates a scene.
 */
export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon && (
        <span className={styles.emptyIcon}>
          <Icon name={icon} size={24} />
        </span>
      )}
      <p className={styles.emptyTitle}>{title}</p>
      {hint && <p className={styles.emptyHint}>{hint}</p>}
    </div>
  );
}
