import { getTranslations } from 'next-intl/server';
import { LiveDashboard } from '@/components/live/LiveDashboard';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';

export default async function Page() {
  const t = await getTranslations('toolkit');
  return (
    <ToolkitPage tool="live" crumbs={[{ label: t('live.title'), href: '/live' }]} title={t('live.title')} lead={t('live.lead')}>
      <LiveDashboard />
    </ToolkitPage>
  );
}
