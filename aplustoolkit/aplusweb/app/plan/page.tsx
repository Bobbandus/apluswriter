import { getTranslations } from 'next-intl/server';
import { ToolCard } from '@/components/toolkit/ToolCard';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';
import grid from '@/components/toolkit/ToolGrid.module.css';

/** A+ Plan: what happens before the camera rolls. */
export default async function PlanHome() {
  const t = await getTranslations('toolkit');

  return (
    <ToolkitPage crumbs={[{ label: t('plan.title'), href: '/plan' }]} eyebrow={t('plan.title')} title={t('plan.title')} lead={t('plan.lead')}>
      <div className={grid.grid}>
        <ToolCard href="/plan/write" image="writehero.png" title={t('write.title')} blurb={t('write.blurb')} openLabel={t('open')} />
        <ToolCard href="/plan/shotlist" image="shotlisthero.png" title={t('shotlist.title')} blurb={t('shotlist.blurb')} soonLabel={t('soon')} openLabel={t('open')} />
        <ToolCard href="/plan/casting" image="castinghero.png" title={t('casting.title')} blurb={t('casting.blurb')} soonLabel={t('soon')} openLabel={t('open')} />
      </div>
    </ToolkitPage>
  );
}
