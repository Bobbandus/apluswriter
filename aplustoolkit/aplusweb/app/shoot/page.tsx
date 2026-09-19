import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/toolkit/ComingSoon';

export default async function Page() {
  const t = await getTranslations('toolkit');
  return <ComingSoon tool="shoot" image="shoothero.png" planned={6} crumbs={[{ label: t('shoot.title'), href: '/shoot' }]} />;
}
