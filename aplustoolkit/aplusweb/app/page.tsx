import { getTranslations } from 'next-intl/server';
import { ToolCard } from '@/components/toolkit/ToolCard';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';
import { DesktopDownloadBanner } from '@/components/desktop/DesktopDownloadBanner';
import grid from '@/components/toolkit/ToolGrid.module.css';

/** The front door: Plan, Shoot and Live. */
export default async function ToolkitHome() {
  const t = await getTranslations('toolkit');

  return (
    <ToolkitPage eyebrow={t('eyebrow')} title={t('name')} lead={t('tagline')}>
      <div className={grid.grid}>
        <ToolCard href="/plan" image="planhero.png" title={t('plan.title')} blurb={t('plan.blurb')} openLabel={t('open')} />
        <ToolCard href="/shoot" image="shoothero.png" title={t('shoot.title')} blurb={t('shoot.blurb')} soonLabel={t('soon')} openLabel={t('open')} />
        <ToolCard href="/live" image="livehero.png" title={t('live.title')} blurb={t('live.blurb')} soonLabel={t('soon')} openLabel={t('open')} />
      </div>
      <DesktopDownloadBanner />
    </ToolkitPage>
  );
}
