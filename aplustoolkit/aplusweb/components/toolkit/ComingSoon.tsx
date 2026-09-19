import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { ToolkitPage, type Crumb } from './ToolkitPage';
import styles from './ToolGrid.module.css';

export interface ComingSoonProps {
  /** Message namespace under `toolkit`, e.g. "shoot". */
  tool: 'shoot' | 'live' | 'shotlist' | 'casting';
  image: string;
  crumbs: Crumb[];
  /** How many `p1…pN` planned items the tool has. */
  planned: number;
}

/**
 * A tool that is on the plan but not built. It says so plainly and lists what
 * is planned, rather than pretending: an empty screen with a spinner would
 * suggest something is loading.
 */
export async function ComingSoon({ tool, image, crumbs, planned }: ComingSoonProps) {
  const t = await getTranslations('toolkit');
  const style = { ['--hero' as string]: `url(/media/hero/${image})` } as CSSProperties;

  return (
    <ToolkitPage crumbs={crumbs} eyebrow={t('soon')} title={t(`${tool}.title`)} lead={t(`${tool}.lead`)}>
      <div className={styles.split}>
        <section>
          <h2 className={styles.plannedTitle}>{t('plannedTitle')}</h2>
          <p className={styles.note}>{t('plannedNote')}</p>
          <ul className={styles.list}>
            {Array.from({ length: planned }, (_, i) => (
              <li key={i}>{t(`${tool}.p${i + 1}`)}</li>
            ))}
          </ul>
        </section>
        <div className={styles.hero} style={style} role="img" aria-label={t(`${tool}.title`)} />
      </div>
    </ToolkitPage>
  );
}
