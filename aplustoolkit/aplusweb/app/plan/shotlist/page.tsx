import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/toolkit/ComingSoon';

export default async function Page() {
  const t = await getTranslations('toolkit');
  return <ComingSoon tool="shotlist" image="shotlisthero.png" planned={4} crumbs={[{ label: t('plan.title'), href: '/plan' }, { label: t('shotlist.title'), href: '/plan/shotlist' }]} />;
}
