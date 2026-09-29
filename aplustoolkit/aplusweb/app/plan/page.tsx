import { getTranslations } from 'next-intl/server';
import { ToolCard } from '@/components/toolkit/ToolCard';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';
import { DesktopDownloadBanner } from '@/components/desktop/DesktopDownloadBanner';
import grid from '@/components/toolkit/ToolGrid.module.css';

/** A+ Plan: what happens before the camera rolls. */
export default async function PlanHome() {
  const t = await getTranslations('toolkit');

  return (
    <ToolkitPage crumbs={[{ label: t('plan.title'), href: '/plan' }]} eyebrow={t('plan.title')} title={t('plan.title')} lead={t('plan.lead')}>
      <div className={`${grid.grid} ${grid.four}`}>
        <ToolCard href="/plan/write" image="writehero.png" title={t('write.title')} blurb={t('write.blurb')} openLabel={t('open')} />
        <ToolCard href="/plan/shotlist" image="shotlisthero.png" title={t('shotlist.title')} blurb={t('shotlist.blurb')} openLabel={t('open')} />
        <ToolCard href="/plan/stripboard" image="planhero.png" title={t('stripboard.title')} blurb={t('stripboard.blurb')} openLabel={t('open')} />
        <ToolCard href="/plan/casting" image="castinghero.png" title={t('casting.title')} blurb={t('casting.blurb')} soonLabel={t('soon')} openLabel={t('open')} />
      </div>
      <DesktopDownloadBanner />
    </ToolkitPage>
  );
}
