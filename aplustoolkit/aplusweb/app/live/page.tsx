import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/toolkit/ComingSoon';

export default async function Page() {
  const t = await getTranslations('toolkit');
  return <ComingSoon tool="live" image="livehero.png" planned={6} crumbs={[{ label: t('live.title'), href: '/live' }]} />;
}
