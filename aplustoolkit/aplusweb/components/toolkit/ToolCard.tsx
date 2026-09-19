import Link from 'next/link';
import type { CSSProperties } from 'react';
import styles from './ToolCard.module.css';

export interface ToolCardProps {
  href: string;
  title: string;
  blurb: string;
  /** Path under /media/hero, e.g. "planhero.png". */
  image: string;
  /** Not built yet: the card still opens, and says so. */
  soonLabel?: string;
  openLabel: string;
}

/**
 * A tall 3:4 card that leads into a tool.
 *
 * The whole card is one link, so it is one tab stop and one big target. The
 * picture does the talking; the text sits on a gradient at the bottom so it
 * stays readable on any image.
 */
export function ToolCard({ href, title, blurb, image, soonLabel, openLabel }: ToolCardProps) {
  const style = { ['--hero' as string]: `url(/media/hero/${image})` } as CSSProperties;

  return (
    <Link href={href} className={styles.card} style={style}>
      <span className={styles.image} aria-hidden="true" />
      {soonLabel && <span className={styles.soon}>{soonLabel}</span>}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.blurb}>{blurb}</span>
        <span className={styles.open}>
          {openLabel} <span aria-hidden="true">→</span>
        </span>
      </span>
    </Link>
  );
}
