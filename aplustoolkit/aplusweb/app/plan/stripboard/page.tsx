import { getTranslations } from 'next-intl/server';
import { ProjectPicker } from '@/components/production/ProjectPicker';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';

/** A+ Plan → Stripboard: pick the script to schedule. */
export default async function StripboardHome() {
  const t = await getTranslations('toolkit');
  const tp = await getTranslations('production');
  return (
    <ToolkitPage
      crumbs={[{ label: t('plan.title'), href: '/plan' }, { label: t('stripboard.title'), href: '/plan/stripboard' }]}
      eyebrow={t('plan.title')}
      title={t('stripboard.title')}
      lead={tp('pickerStripboardLead')}
    >
      <ProjectPicker tool="stripboard" />
    </ToolkitPage>
  );
}
