import { getTranslations } from 'next-intl/server';
import { ProjectPicker } from '@/components/production/ProjectPicker';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';

/** A+ Plan → Shotlist: pick the script to plan the shots of. */
export default async function ShotlistHome() {
  const t = await getTranslations('toolkit');
  const tp = await getTranslations('production');
  return (
    <ToolkitPage
      crumbs={[{ label: t('plan.title'), href: '/plan' }, { label: t('shotlist.title'), href: '/plan/shotlist' }]}
      eyebrow={t('plan.title')}
      title={t('shotlist.title')}
      lead={tp('pickerShotlistLead')}
    >
      <ProjectPicker tool="shotlist" />
    </ToolkitPage>
  );
}
