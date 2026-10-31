import { getTranslations } from 'next-intl/server';
import { ProjectPicker } from '@/components/production/ProjectPicker';
import { ToolCard } from '@/components/toolkit/ToolCard';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';
import grid from '@/components/toolkit/ToolGrid.module.css';

/** A+ Shoot: pick the script you are shooting, or take the slate on its own. */
export default async function ShootHome() {
  const t = await getTranslations('toolkit');
  const ts = await getTranslations('shoot.set');
  return (
    <ToolkitPage crumbs={[{ label: t('shoot.title'), href: '/shoot' }]} tool="shoot" eyebrow={t('shoot.title')} title={t('shoot.title')} lead={t('shoot.lead')}>
      <div className={grid.split}>
        <section>
          <h2 className={grid.plannedTitle}>{ts('pickTitle')}</h2>
          <p className={grid.note}>{ts('pickLead')}</p>
          <ProjectPicker tool="shoot" />
          <h2 className={grid.plannedTitle} style={{ marginTop: 'var(--s-8)' }}>
            {ts('whatTitle')}
          </h2>
          <ul className={grid.list}>
            {(['day', 'shots', 'slate', 'log', 'gear', 'report'] as const).map((key) => (
              <li key={key}>{ts(`what.${key}`)}</li>
            ))}
          </ul>
        </section>
        <div style={{ maxWidth: 300 }}>
          <ToolCard href="/shoot/klappa" image="shoothero.png" title={t('slate.title')} blurb={t('slate.blurb')} openLabel={t('open')} />
        </div>
      </div>
    </ToolkitPage>
  );
}
