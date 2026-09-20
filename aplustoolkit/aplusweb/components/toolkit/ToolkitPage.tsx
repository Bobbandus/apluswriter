import Link from 'next/link';
import type { ReactNode } from 'react';
import { AccountButton } from '@/components/auth/AccountButton';
import styles from './ToolkitPage.module.css';

export interface Crumb {
  label: string;
  href: string;
}

export interface ToolkitPageProps {
  /** Where this page sits, shown in the top bar. The last one is the page itself. */
  crumbs?: Crumb[];
  /** Which tool this page belongs to; Shoot and Live carry the wine accent. */
  tool?: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}

/**
 * The frame every Toolkit page shares: a slim top bar with the way back, a big
 * title, and room below. Server-rendered — these pages are just navigation.
 */
export function ToolkitPage({ crumbs = [], tool, eyebrow, title, lead, children }: ToolkitPageProps) {
  return (
    <div className={styles.page} data-tool={tool}>
      <header className={styles.bar}>
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <Link href="/" className={styles.brand}>
            A<span className={styles.plus}>+</span> Toolkit
          </Link>
          {crumbs.map((crumb) => (
            <span key={crumb.href} className={styles.crumb}>
              <span aria-hidden="true" className={styles.sep}>
                /
              </span>
              <Link href={crumb.href}>{crumb.label}</Link>
            </span>
          ))}
        </nav>
        <AccountButton />
      </header>

      <main className={styles.main}>
        <div className={styles.head}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.title}>{title}</h1>
          {lead && <p className={styles.lead}>{lead}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
