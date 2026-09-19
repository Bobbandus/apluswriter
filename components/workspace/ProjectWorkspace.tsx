'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Workspace } from '@/components/shell/Workspace';
import { Navigator } from '@/components/navigator/Navigator';
import { Inspector } from '@/components/inspector/Inspector';
import { PageCanvas } from '@/components/editor/PageCanvas';
import { SettingsSheet } from '@/components/settings/SettingsSheet';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import type { PageSize } from '@/lib/paginator/geometry';

export interface ProjectWorkspaceProps {
  projectId: string;
}

/**
 * The editing surface for one project.
 *
 * Entirely client-side by design: no server components and no server actions
 * are involved in editing. That is what keeps the route working offline, and
 * what will let the Electron build mount this same tree against a
 * FileSystemAdapter without touching any of it.
 */
export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  const t = useTranslations('common');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pageSize, setPageSize] = usePersistentState<PageSize>('aplus.ui.pageSize', 'a4');

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  useHotkeys({ 'mod+,': openSettings });

  return (
    <>
      <Workspace
        projectTitle={t('untitled')}
        // Save status and revision labels arrive with the storage layer in M6.
        // Until something is genuinely being saved, the titlebar says nothing
        // rather than claiming the work is safe.
        saveState={null}
        sidebar={<Navigator />}
        inspector={<Inspector onOpenSettings={openSettings} />}
      >
        <PageCanvas pageSize={pageSize} />
      </Workspace>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />
    </>
  );
}
