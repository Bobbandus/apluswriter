import { getTranslations } from 'next-intl/server';
import { ToolCard } from '@/components/toolkit/ToolCard';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';
import grid from '@/components/toolkit/ToolGrid.module.css';

/** A+ Shoot: the tools for the shooting day. The slate is the first one built. */
export default async function ShootHome() {
  const t = await getTranslations('toolkit');
  const planned = 5;
  return (
    <ToolkitPage crumbs={[{ label: t('shoot.title'), href: '/shoot' }]} tool="shoot" eyebrow={t('shoot.title')} title={t('shoot.title')} lead={t('shoot.lead')}>
      <div className={grid.split}>
        <section>
          <h2 className={grid.plannedTitle}>{t('plannedTitle')}</h2>
          <p className={grid.note}>{t('shoot.plannedNote')}</p>
          <ul className={grid.list}>
            {Array.from({ length: planned }, (_, i) => (
              <li key={i}>{t(`shoot.p${i + 1}`)}</li>
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
