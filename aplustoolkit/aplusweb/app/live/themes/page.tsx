import { getTranslations } from 'next-intl/server';
import { ThemeGallery } from '@/components/live/ThemeGallery';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';

export default async function Page() {
  const t = await getTranslations('toolkit');
  const g = await getTranslations('live.gallery');
  return (
    <ToolkitPage
      tool="live"
      crumbs={[
        { label: t('live.title'), href: '/live' },
        { label: g('title'), href: '/live/themes' },
      ]}
      title={g('title')}
      lead={g('lead')}
    >
      <ThemeGallery />
    </ToolkitPage>
  );
}
