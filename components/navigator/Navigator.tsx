'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, Panel } from '@/components/ui/Panel';
import { SearchField } from '@/components/ui/SearchField';

/**
 * The scene navigator.
 *
 * Structure comes from the script itself: Sections (`#`) become acts,
 * sub-sections (`##`) become sequences, and scene headings become scenes. The
 * tree is a view of the text, never a separate outline that can fall out of
 * sync with it.
 *
 * The tree arrives with the parser in M2; today this renders the real empty
 * state, which is what a new script actually shows.
 */
export function Navigator() {
  const t = useTranslations('navigator');
  const [filter, setFilter] = useState('');

  return (
    <Panel
      title={t('title')}
      footer={<SearchField value={filter} onValueChange={setFilter} placeholder={t('filter')} />}
    >
      <EmptyState icon="elScene" title={t('noScenes')} hint={t('noScenesHint')} />
    </Panel>
  );
}
