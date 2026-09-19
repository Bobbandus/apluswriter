'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { EmptyState, Panel } from '@/components/ui/Panel';

export interface InspectorProps {
  onOpenSettings: () => void;
}

/**
 * The right-hand inspector.
 *
 * It shows whatever is selected — a scene's cast, location, colour, status and
 * tags; a character's stats. With nothing selected it says so, which is the
 * state it will keep showing in v1 whenever the caret is between scenes.
 */
export function Inspector({ onOpenSettings }: InspectorProps) {
  const t = useTranslations('common');
  const tSettings = useTranslations('settings');
  const tNav = useTranslations('navigator');

  return (
    <Panel
      title={t('scene')}
      actions={
        <Tooltip label={tSettings('title')} shortcut="mod+," placement="left">
          <Button
            variant="ghost"
            size="sm"
            icon="settings"
            aria-label={tSettings('title')}
            onClick={onOpenSettings}
          />
        </Tooltip>
      }
    >
      <EmptyState icon="cards" title={tNav('noScenes')} hint={tNav('noScenesHint')} />
    </Panel>
  );
}
