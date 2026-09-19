'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Workspace } from '@/components/shell/Workspace';
import { Navigator } from '@/components/navigator/Navigator';
import { Inspector } from '@/components/inspector/Inspector';
import { PageCanvas } from '@/components/editor/PageCanvas';
import { ScriptEditor, type ScriptEditorHandle } from '@/components/editor/ScriptEditor';
import { ElementBar } from '@/components/editor/ElementBar';
import type { LineType } from '@aplus/fountain/lineClassify';
import { SettingsSheet } from '@/components/settings/SettingsSheet';
import { DictionarySheet } from '@/components/dictionary/DictionarySheet';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { useScript } from '@/lib/hooks/useScript';
import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
} from '@/components/editor/fountain/settings';
import type { PageSize } from '@aplus/paginator/geometry';
import { dictionaryFromScript, mergeDictionary, type DictionaryData, type DictionaryKind } from '@aplus/fountain/autocomplete';

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
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [pageSize, setPageSize] = usePersistentState<PageSize>('aplus.ui.pageSize', 'a4');

  /* The document lives here until the storage layer lands in M6. It is held
     in local storage so a reload does not lose work — a stopgap, but a
     crash-safe one, and better than holding it only in memory. */
  const [source, setSource, { hydrated }] = usePersistentState(
    `aplus.draft.${projectId}`,
    '',
  );

  const [editor, setEditor] = usePersistentState<EditorSettings>(
    'aplus.ui.editor',
    DEFAULT_EDITOR_SETTINGS,
  );

  const [caret, setCaret] = useState(0);
  const [element, setElement] = useState<LineType | null>(null);
  const editorRef = useRef<ScriptEditorHandle>(null);
  const [dictionary, setDictionary] = usePersistentState<DictionaryData>(
    `aplus.dictionary.${projectId}`,
    { characters: [], locations: [], tags: [] },
  );

  const script = useScript(source);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openDictionary = useCallback(() => setDictionaryOpen(true), []);

  // A newly typed cue or heading is usable immediately, without a save or a
  // manual rebuild. The stored list also keeps manually learned values.
  useEffect(() => {
    setDictionary((current) => mergeDictionary(current, dictionaryFromScript(script)));
  }, [script, setDictionary]);

  const replaceDictionaryValue = useCallback((kind: DictionaryKind, from: string, to: string) => {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (kind === 'character') {
      // Cues and CAST metadata are structured positions; dialogue prose is
      // deliberately untouched by a character rename.
      setSource((value) => value
        .replace(new RegExp(`(^|\\n)(@?)${escaped}(\\s*(?:\\([^\\n)]*\\))?\\^?)(?=\\s*(?:\\n|$))`, 'gmi'), `$1$2${to}$3`)
        .replace(new RegExp(`(\\[\\[CAST\\s*:\\s*[^\\]]*)\\b${escaped}\\b`, 'gi'), `$1${to}`));
    } else if (kind === 'location') {
      setSource((value) => value.replace(new RegExp(`(^|\\n)(\\.?(?:INT|EXT|EST|I/E|INT\\./EXT|EXT\\./INT)\\.?\\s+)${escaped}`, 'gmi'), `$1$2${to}`));
    }
    setDictionary((current) => ({
      ...current,
      [`${kind}s`]: current[`${kind}s` as "characters" | "locations" | "tags"].map((value) => value === from ? to : value),
    }) as DictionaryData);
  }, [setDictionary, setSource]);

  const removeDictionaryValue = useCallback((kind: DictionaryKind, value: string) => {
    setDictionary((current) => ({
      ...current,
      [`${kind}s`]: current[`${kind}s` as "characters" | "locations" | "tags"].filter((item) => item !== value),
    }) as DictionaryData);
  }, [setDictionary]);

  const mergeDictionaryValue = useCallback((kind: DictionaryKind, from: string, into: string) => {
    replaceDictionaryValue(kind, from, into);
    removeDictionaryValue(kind, from);
  }, [removeDictionaryValue, replaceDictionaryValue]);

  const rebuildDictionary = useCallback(() => setDictionary(dictionaryFromScript(script)), [script, setDictionary]);
  const autocompleteDictionary = useMemo(() => mergeDictionary(dictionary, dictionaryFromScript(script)), [dictionary, script]);

  useHotkeys({ 'mod+,': openSettings });

  // The scene the caret is in, so the navigator and inspector follow along.
  const scene =
    script.scenes.find((s) => caret >= s.from && caret < s.to) ?? script.scenes[0];

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
        sidebar={
          <Navigator
            scenes={script.scenes}
            caret={caret}
            onSelectScene={(selected) => editorRef.current?.revealOffset(selected.from)}
          />
        }
        inspector={<Inspector onOpenSettings={openSettings} onOpenDictionary={openDictionary} scene={scene} script={script} />}
      >
        <PageCanvas
          pageSize={pageSize}
          toolbar={
            hydrated ? (
              <ElementBar
                current={element}
                onChoose={(type) => editorRef.current?.switchElement(type)}
              />
            ) : null
          }
        >
          {/* Mounting before the stored draft has been read would start the
              editor on an empty document and then overwrite the writer's
              work with it. */}
          {hydrated && (
            <ScriptEditor
              ref={editorRef}
              onElementChange={setElement}
              initialValue={source}
              value={source}
              onChange={setSource}
              onCaretChange={setCaret}
              settings={editor}
              dictionary={autocompleteDictionary}
            />
          )}
        </PageCanvas>
      </Workspace>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        editor={editor}
        onEditorChange={setEditor}
      />
      <DictionarySheet
        open={dictionaryOpen}
        onClose={() => setDictionaryOpen(false)}
        dictionary={autocompleteDictionary}
        onRename={replaceDictionaryValue}
        onRemove={removeDictionaryValue}
        onMerge={mergeDictionaryValue}
        onRebuild={rebuildDictionary}
      />
    </>
  );
}
