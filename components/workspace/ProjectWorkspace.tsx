'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Workspace } from '@/components/shell/Workspace';
import { Navigator } from '@/components/navigator/Navigator';
import { Inspector } from '@/components/inspector/Inspector';
import { PageCanvas } from '@/components/editor/PageCanvas';
import { ScriptEditor } from '@/components/editor/ScriptEditor';
import { SettingsSheet } from '@/components/settings/SettingsSheet';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { useScript } from '@/lib/hooks/useScript';
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

  /* The document lives here until the storage layer lands in M6. It is held
     in local storage so a reload does not lose work — a stopgap, but a
     crash-safe one, and better than holding it only in memory. */
  const [source, setSource, { hydrated }] = usePersistentState(
    `aplus.draft.${projectId}`,
    '',
  );

  const script = useScript(source);
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  useHotkeys({ 'mod+,': openSettings });

  const scene = script.scenes[0];

  return (
    <>
      <Workspace
        projectTitle={
          script.titlePage?.fields.find((f) => f.key === 'title' || f.key === 'titel')?.values[0] ??
          t('untitled')
        }
        // Save status arrives with the storage layer in M6. Until something is
        // genuinely being saved to a server, the titlebar says nothing rather
        // than claiming the work is safe.
        saveState={null}
        sidebar={<Navigator scenes={script.scenes} />}
        inspector={<Inspector onOpenSettings={openSettings} scene={scene} script={script} />}
      >
        <PageCanvas pageSize={pageSize}>
          {/* Mounting before the stored draft has been read would start the
              editor on an empty document and then overwrite the writer's
              work with it. */}
          {hydrated && (
            <ScriptEditor initialValue={source} onChange={setSource} />
          )}
        </PageCanvas>
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
