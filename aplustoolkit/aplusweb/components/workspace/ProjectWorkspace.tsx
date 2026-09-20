'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Workspace } from '@/components/shell/Workspace';
import { Navigator } from '@/components/navigator/Navigator';
import { Inspector } from '@/components/inspector/Inspector';
import { InspectorTabs, type InspectorTab } from '@/components/inspector/InspectorTabs';
import { ShotlistBlock } from '@/components/inspector/ShotlistBlock';
import { SuggestionsPanel } from '@/components/suggestions/SuggestionsPanel';
import { useToast } from '@/components/ui/Toast';
import { useBridge } from '@/lib/bridge/useBridge';
import { sceneOffset, useAssistant } from '@/lib/bridge/useAssistant';
import type { AppState } from '@aplus/bridge/protocol';
import { diffToEdit, editsFor } from '@aplus/bridge/apply';
import { parse } from '@aplus/fountain/parse';
import { reorderScenes } from '@aplus/fountain/structure';
import { removeTodo } from '@aplus/fountain/todos';
import { TodoPanel, type TodoItem } from '@/components/todos/TodoPanel';
import type { SceneIndexEntry } from '@aplus/fountain/types';
import { SceneAlternatives } from '@/components/alternatives/SceneAlternatives';
import { alternativesOf, removeAlternative, saveAlternative, swapAlternative } from '@aplus/fountain/alternatives';
import { CastSheet } from '@/components/cast/CastSheet';
import { RevisionMenu } from '@/components/revisions/RevisionMenu';
import { useRevisions } from '@/lib/storage/useRevisions';
import type { Revision } from '@aplus/fountain/revisions';
import { IndexCardBoard } from '@/components/cards/IndexCardBoard';
import { PageCanvas } from '@/components/editor/PageCanvas';
import { ScriptEditor, type ScriptEditorHandle } from '@/components/editor/ScriptEditor';
import { ElementBar } from '@/components/editor/ElementBar';
import type { LineType } from '@aplus/fountain/lineClassify';
import { SettingsSheet } from '@/components/settings/SettingsSheet';
import { DictionarySheet } from '@/components/dictionary/DictionarySheet';
import { TitlePageSheet } from '@/components/export/TitlePageSheet';
import { WritingPill } from '@/components/writing/WritingPill';
import { useWritingStats } from '@/lib/hooks/useWritingStats';
import { TimelineSheet } from '@/components/timeline/TimelineSheet';
import { sceneNoteEdit } from '@aplus/bridge/apply';
import { useMirror } from '@/lib/hooks/useMirror';
import { FindReplace } from '@/components/find/FindReplace';
import { CommandPalette } from '@/components/command/CommandPalette';
import type { Command } from '@/lib/commands';
import { ExportSheet } from '@/components/export/ExportSheet';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { useScript } from '@/lib/hooks/useScript';
import { useProjectData, useProjectDocument } from '@/lib/storage/hooks';
import { ConflictSheet } from '@/components/sync/ConflictSheet';
import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
} from '@/components/editor/fountain/settings';
import type { PageSize } from '@aplus/paginator/geometry';
import {
  addLearned,
  dictionaryFromScript,
  learnFromSource,
  learnedFrom,
  mergeDictionary,
  type DictionaryData,
  type DictionaryKind,
} from '@aplus/fountain/autocomplete';

/**
 * How long the writer must pause before the dictionary learns anything.
 *
 * Long enough that a name is not learned between two keystrokes, short enough
 * that a cue typed a moment ago is offered in the next scene.
 */
const LEARN_DELAY = 800;

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
  const router = useRouter();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  /* The document, kept safe by the sync engine: IndexedDB first, then the
     cloud if the project lives there. See lib/storage/sync.ts. */
  const doc = useProjectDocument(projectId, t('untitled'));
  const pageSize: PageSize = doc.meta?.pageSize ?? 'a4';
  const setPageSize = (size: PageSize) => void doc.setPageSize(size);

  /* A plain copy of the text for parsing and for structural edits (renames).
     The editor itself owns the live document. */
  const [source, setSourceState] = useState('');
  const sourceRef = useRef('');
  const [syncedRevision, setSyncedRevision] = useState(-1);

  /* Synced during render, not in an effect. With an effect there is one
     render where the editor could mount holding the loaded text while this
     copy is still '' — and the editor's external-value sync would then
     replace the script with nothing and save it. */
  if (doc.ready && syncedRevision !== doc.revision) {
    sourceRef.current = doc.content;
    setSourceState(doc.content);
    setSyncedRevision(doc.revision);
  }
  const hydrated = doc.ready && syncedRevision === doc.revision;

  const setSource = useCallback(
    (next: string | ((previous: string) => string)) => {
      const value = typeof next === 'function' ? next(sourceRef.current) : next;
      if (value === sourceRef.current) return;
      sourceRef.current = value;
      setSourceState(value);
      doc.update(value);
    },
    // doc.update is stable; the rest of doc changes on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.update],
  );

  const [editor, setEditor] = usePersistentState<EditorSettings>(
    'aplus.ui.editor',
    DEFAULT_EDITOR_SETTINGS,
  );

  /* The same scenes, drawn as index cards. Not remembered between visits: the
     writer opens a script to write, and finding it on the board would be a
     small surprise every time. */
  const [view, setView] = useState<'script' | 'cards'>('script');
  const [caret, setCaret] = useState(0);
  const [selection, setSelection] = useState({ from: 0, to: 0, text: '' });
  const [tab, setTab] = useState<InspectorTab>('scene');
  const [cardsEnabled, setCardsEnabled] = usePersistentState('aplus.ui.cards', true);
  /* Per project, not per device: how a script should sound belongs to the
     script, and it is what Claude reads before it writes anything. */
  const [styleGuide, setStyleGuide] = useProjectData<string>(projectId, 'styleGuide', '');
  const [toast, say] = useToast();
  const tAssistant = useTranslations('assistant');
  const tRevisions = useTranslations('revisions');
  const tAlternatives = useTranslations('alternatives');
  const [element, setElement] = useState<LineType | null>(null);
  const editorRef = useRef<ScriptEditorHandle>(null);
  const [dictionary, setDictionary] = usePersistentState<DictionaryData>(
    `aplus.dictionary.${projectId}`,
    { characters: [], locations: [], tags: [] },
  );

  const locale = useLocale();
  // The page view and the PDF must break pages identically, so the worker
  // paginates with exactly the options the exporter will use.
  const layoutOptions = useMemo(
    () => ({
      pageSize,
      moreLabel: locale === 'en' ? '(MORE)' : '(MER)',
      contdLabel: locale === 'en' ? "(CONT'D)" : '(FORTS.)',
    }),
    [pageSize, locale],
  );
  const script = useScript(source, layoutOptions);

  // What Claude can see of the open script. Only the live text and where the
  // writer is; nothing is sent anywhere but this computer.
  const bridgeState = useMemo<AppState | null>(
    () =>
      hydrated
        ? {
            projectId,
            title: doc.meta?.title ?? '',
            source,
            caret,
            selection,
            pageSize,
            locale: locale === 'en' ? 'en' : 'sv',
            cards: cardsEnabled,
            ...(styleGuide.trim() ? { styleGuide: styleGuide.trim() } : {}),
          }
        : null,
    [hydrated, projectId, doc.meta?.title, source, caret, selection, pageSize, locale, cardsEnabled, styleGuide],
  );
  const bridge = useBridge(bridgeState);
  const assistant = useAssistant(projectId, editorRef, bridge, say, {
    applied: tAssistant('applied'),
    partlyStale: tAssistant('partlyStale'),
    stale: tAssistant('stale'),
    sceneGone: tAssistant('sceneGone'),
    notFormatting: tAssistant('notFormatting'),
    saved: tAssistant('saved'),
  });

  // A new card is worth a glance: bring the suggestions tab forward.
  const cardCount = bridge.cards.length;
  useEffect(() => {
    if (cardCount > 0 && cardsEnabled) setTab('suggestions');
  }, [cardCount, cardsEnabled]);

  // "Look at scene 12": Claude asks the app to scroll there.
  useEffect(() => {
    bridge.onFocus((ref) => {
      const offset = sceneOffset(editorRef.current?.getText() ?? sourceRef.current, ref);
      if (offset !== null) editorRef.current?.revealOffset(offset);
    });
  }, [bridge]);
  /* ---------------------------------------------------------- index cards
     Every edit the board makes goes through the editor as one transaction, so
     a drag is one undo — and the cards redraw from the text that results,
     never from a copy of their own. */

  const moveScene = useCallback((from: number, to: number) => {
    const handle = editorRef.current;
    if (!handle) return;
    const current = handle.getText();
    const next = reorderScenes(current, from, to);
    if (next !== current) handle.applyChanges(diffToEdit(current, next));
  }, []);

  /** Moves the scene the caret is in one step, keeping the caret at the same place inside it. */
  const moveCaretScene = useCallback(
    (step: -1 | 1) => {
      const handle = editorRef.current;
      if (!handle) return;
      const text = handle.getText();
      const at = handle.getSelection().from;
      const scenes = parse(text).scenes;
      const index = scenes.findIndex((s) => at >= s.from && at < s.to);
      const target = index + step;
      if (index < 0 || target < 0 || target >= scenes.length) return;
      const inside = at - scenes[index]!.from;
      moveScene(index, target);
      const moved = parse(handle.getText()).scenes[target];
      if (moved) {
        const place = moved.from + Math.min(inside, Math.max(0, moved.to - moved.from - 1));
        handle.selectRange(place, place);
      }
    },
    [moveScene],
  );

  const writeSynopsis = useCallback((scene: SceneIndexEntry, text: string, index: number) => {
    const handle = editorRef.current;
    if (!handle) return;
    const result = editsFor(handle.getText(), { kind: 'synopsis', scene: { index, heading: scene.heading }, text });
    if (result.ok) handle.applyChanges(result.edits);
  }, []);

  /* ------------------------------------------------------------- revisions
     Drafts, and the quiet snapshots taken between them. The hook reads the
     live document through this function and never keeps a copy of its own. */

  const liveText = useCallback(() => editorRef.current?.getText() ?? sourceRef.current, []);
  const revisions = useRevisions(projectId, source, liveText, hydrated);

  const restoreRevision = useCallback(
    async (revision: Revision) => {
      const handle = editorRef.current;
      if (!handle) return;
      // Keep what is here first, so a restore can never be the last copy of
      // the words it replaces. Then it is one edit: Ctrl+Z is a second way back.
      await revisions.guard();
      const current = handle.getText();
      handle.applyChanges(diffToEdit(current, revision.content));
      setVersionsOpen(false);
      say(tRevisions('restored'));
    },
    [revisions, say, tRevisions],
  );

  /* ------------------------------------------------- scene alternatives
     Every change rewrites the source and goes in as one edit, so a swap is one
     undo. The scene is the one the caret is in at the moment of the click. */

  const editScene = useCallback((rewrite: (text: string, index: number) => string) => {
    const handle = editorRef.current;
    if (!handle) return;
    const text = handle.getText();
    const caretAt = handle.getSelection().from;
    const at = parse(text).scenes.findIndex((s) => caretAt >= s.from && caretAt < s.to);
    const next = rewrite(text, Math.max(0, at));
    if (next !== text) handle.applyChanges(diffToEdit(text, next));
  }, []);

  /* --------------------------------------------------------------- to-dos
     The list comes from the parse worker, which is a moment behind the
     editor. So a click is resolved against the live text: re-read the notes
     there, take the one that says the same thing nearest where it was, and
     remove that. Deleting by a stale offset would take out somebody's words. */

  const liveTodo = useCallback((todo: TodoItem) => {
    const handle = editorRef.current;
    if (!handle) return null;
    const text = handle.getText();
    const match = parse(text)
      .todos.filter((candidate) => candidate.text === todo.text)
      .sort((a, b) => Math.abs(a.from - todo.from) - Math.abs(b.from - todo.from))[0];
    return match ? { handle, text, match } : null;
  }, []);

  const revealTodo = useCallback(
    (todo: TodoItem) => {
      const found = liveTodo(todo);
      if (found) found.handle.revealOffset(found.match.from);
    },
    [liveTodo],
  );

  const finishTodo = useCallback(
    (todo: TodoItem) => {
      const found = liveTodo(todo);
      if (found) found.handle.applyChanges([removeTodo(found.text, found.match)]);
    },
    [liveTodo],
  );

  const openScene = useCallback((scene: SceneIndexEntry) => {
    setView('script');
    // The editor is hidden, not unmounted, but it can only scroll once it is
    // laid out again.
    window.requestAnimationFrame(() => editorRef.current?.revealOffset(scene.from));
  }, []);

  // With the board showing, the editor is not focused and the keystroke would
  // never reach its history. Text fields keep their own undo.
  useEffect(() => {
    if (view !== 'cards') return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      event.preventDefault();
      if (event.shiftKey) editorRef.current?.redo();
      else editorRef.current?.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openDictionary = useCallback(() => setDictionaryOpen(true), []);
  const openCast = useCallback(() => setCastOpen(true), []);

  /* What the open script teaches the stored dictionary.
     Only names the writer has finished and moved on from, and only after a
     pause — typing ERIK passes through E, ER and ERI, and remembering those
     would leave three ghosts behind that outlive the script they came from.
     Everything currently in the script is offered by autofinish regardless,
     through dictionaryFromScript below; this is only about what survives. */
  const learnable = script.learnable;
  useEffect(() => {
    if (learnable.length === 0) return;
    const timer = window.setTimeout(() => {
      const learned = learnedFrom(learnable, caret);
      setDictionary((current) => addLearned(current, learned));
    }, LEARN_DELAY);
    return () => window.clearTimeout(timer);
  }, [learnable, caret, setDictionary]);

  const addDictionaryValue = useCallback((kind: DictionaryKind, value: string) => {
    // Cues and locations are upper case everywhere else in the dictionary;
    // a tag is written as the writer typed it.
    const trimmed = kind === 'tag' ? value.trim() : value.trim().toLocaleUpperCase();
    if (!trimmed) return;
    setDictionary((current) => {
      const key = `${kind}s` as 'characters' | 'locations' | 'tags';
      if (current[key].some((item) => item.toLocaleUpperCase() === trimmed.toLocaleUpperCase())) return current;
      return { ...current, [key]: [...current[key], trimmed] };
    });
  }, [setDictionary]);

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

  /* "Rebuild from the script" replaces the lists outright, as the sheet says
     it does. That is the way out of a dictionary that has learned something
     the writer has since renamed or abandoned. */
  const rebuildDictionary = useCallback(() => {
    setDictionary(learnFromSource(sourceRef.current));
  }, [setDictionary]);
  const autocompleteDictionary = useMemo(() => mergeDictionary(dictionary, dictionaryFromScript(script)), [dictionary, script]);

  // Page and scene counts for the dashboard, from the same pagination as the PDF.
  const pageCount = script.layout?.pageCount;
  const sceneCount = script.scenes.length;
  useEffect(() => {
    if (!hydrated || pageCount === undefined) return;
    doc.recordStats({ pages: pageCount, scenes: sceneCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, pageCount, sceneCount]);

  const writing = useWritingStats(projectId, source, hydrated);
  const mirror = useMirror(projectId, doc.meta?.title ?? '', source, hydrated);
  const [passResult, setPassResult] = useState<{ minutes: number; words: number } | null>(null);
  useEffect(() => {
    if (!passResult) return;
    const timer = window.setTimeout(() => setPassResult(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [passResult]);
  const togglePass = useCallback(() => {
    if (writing.pass) setPassResult(writing.endPass());
    else {
      setPassResult(null);
      writing.startPass();
    }
  }, [writing]);

  const setSceneField = useCallback((sceneIndex: number, field: 'day' | 'energy', value: number | null) => {
    const handle = editorRef.current;
    if (!handle) return;
    const text = handle.getText();
    const keys = field === 'day' ? ['day', 'dag'] : ['energy', 'energi'];
    const edit = sceneNoteEdit(text, sceneIndex, keys, value === null ? null : String(value));
    // A field left as it was writes nothing: no empty undo step, no needless save.
    if (edit && text.slice(edit.from, edit.to) !== edit.insert) handle.applyChanges([edit]);
  }, []);

  const tCommand = useTranslations('command');
  const commands = useMemo<Command[]>(
    () => [
      { id: 'export', label: tCommand('export'), group: tCommand('groupScript'), keywords: 'pdf fdx html csv fountain sidor rapport', shortcut: 'mod+e', run: () => setExportOpen(true) },
      { id: 'titlePage', label: tCommand('titlePage'), group: tCommand('groupScript'), keywords: 'titel författare kontakt', run: () => setTitleOpen(true) },
      { id: 'versions', label: tCommand('versions'), group: tCommand('groupScript'), keywords: 'revision utkast ögonblicksbild historik', run: () => setVersionsOpen(true) },
      { id: 'cast', label: tCommand('cast'), group: tCommand('groupScript'), keywords: 'roller platser relationer karaktärer', run: () => setCastOpen(true) },
      { id: 'dictionary', label: tCommand('dictionary'), group: tCommand('groupScript'), keywords: 'ordlista autocomplete', run: () => setDictionaryOpen(true) },
      { id: 'find', label: tCommand('find'), group: tCommand('groupScript'), keywords: 'sök search', shortcut: 'mod+f', run: () => { setView('script'); setReplaceMode(false); setFindOpen(true); } },
      { id: 'replace', label: tCommand('replace'), group: tCommand('groupScript'), keywords: 'ersätt byt namn replace regex', shortcut: 'mod+h', run: () => { setView('script'); setReplaceMode(true); setFindOpen(true); } },
      { id: 'counter', label: writing.enabled ? tCommand('counterOff') : tCommand('counterOn'), group: tCommand('groupView'), keywords: 'ord räknare idag skrivpass', run: () => writing.setEnabled(!writing.enabled) },
      { id: 'pass', label: writing.pass ? tCommand('passEnd') : tCommand('passStart'), group: tCommand('groupScript'), keywords: 'skrivpass timer sprint', run: () => { writing.setEnabled(true); togglePass(); } },
      { id: 'timeline', label: tCommand('timeline'), group: tCommand('groupScript'), keywords: 'dag dagar energi kurva rytm story tidslinje', run: () => setTimelineOpen(true) },
      { id: 'viewScript', label: tCommand('viewScript'), group: tCommand('groupView'), keywords: 'manus editor', run: () => setView('script') },
      { id: 'viewCards', label: tCommand('viewCards'), group: tCommand('groupView'), keywords: 'kort indexkort struktur', run: () => setView('cards') },
      { id: 'settings', label: tCommand('settings'), group: tCommand('groupView'), keywords: 'tema språk sidformat', shortcut: 'mod+,', run: () => setSettingsOpen(true) },
      { id: 'projects', label: tCommand('projects'), group: tCommand('groupProject'), keywords: 'hem alla', run: () => router.push('/plan/write') },
      ...script.sections.map((section, index) => ({
        id: `scene:section:${index}`,
        label: `${'  '.repeat(Math.max(0, section.depth - 1))}§ ${section.title}`,
        group: tCommand('groupNavigate'),
        run: () => {
          setView('script');
          editorRef.current?.revealOffset(section.from);
        },
      })),
      ...script.scenes.map((target, index) => ({
        id: `scene:${index}`,
        label: `${target.sceneNumber ?? index + 1}  ${target.heading}`,
        group: tCommand('groupNavigate'),
        run: () => {
          setView('script');
          editorRef.current?.revealOffset(target.from);
        },
      })),
    ],
    [tCommand, script.sections, script.scenes, router, writing, togglePass],
  );

  useHotkeys({
    'mod+,': openSettings,
    // Move the scene the caret is in, without leaving the keyboard.
    'mod+shift+arrowup': () => view === 'script' && moveCaretScene(-1),
    'mod+shift+arrowdown': () => view === 'script' && moveCaretScene(1),
    'mod+e': () => setExportOpen(true),
    // Our own panel replaces the editor's, and only makes sense over the script.
    'mod+f': (event) => {
      if (view !== 'script') return;
      event.preventDefault();
      setReplaceMode(false);
      setFindOpen(true);
    },
    'mod+h': (event) => {
      if (view !== 'script') return;
      event.preventDefault();
      setReplaceMode(true);
      setFindOpen(true);
    },
  });

  // The scene the caret is in, so the navigator and inspector follow along.
  const scene =
    script.scenes.find((s) => caret >= s.from && caret < s.to) ?? script.scenes[0];

  return (
    <>
      <Workspace
        projectTitle={
          // The project's own name, unless it is still the default and the
          // script has since been given a title page.
          (doc.meta && doc.meta.title !== t('untitled') ? doc.meta.title : null) ??
          script.titlePage?.fields.find((f) => f.key === 'title' || f.key === 'titel')?.values[0]?.replace(/[*_]/g, '') ??
          doc.meta?.title ??
          t('untitled')
        }
        // Save status arrives with the storage layer in M6. Until something is
        // genuinely being saved to a server, the titlebar says nothing rather
        // than claiming the work is safe.
        saveState={hydrated ? doc.state : null}
        onExport={() => setExportOpen(true)}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        status={
          writing.enabled ? (
            <WritingPill
              today={writing.writtenToday}
              pass={writing.pass}
              passWords={writing.passWords}
              result={passResult}
              onStart={togglePass}
              onEnd={togglePass}
            />
          ) : null
        }
        view={view}
        onViewChange={setView}
        version={revisions.latestNamed ? revisions.latestNamed.label || tRevisions(`colors.${revisions.latestNamed.color ?? 'white'}`) : undefined}
        onOpenVersionMenu={() => setVersionsOpen(true)}
        onHome={() => router.push('/plan/write')}
        sidebar={
          <Navigator
            scenes={script.scenes}
            sections={script.sections}
            caret={caret}
            eighths={script.layout?.sceneEighths}
            onSelectScene={(selected) => editorRef.current?.revealOffset(selected.from)}
            onSelectSection={(selected) => editorRef.current?.revealOffset(selected.from)}
          />
        }
        inspector={
          <InspectorTabs
            tab={tab}
            onTab={setTab}
            count={bridge.cards.length}
            connected={bridge.status === 'connected'}
            showSuggestions={cardsEnabled}
            todoCount={script.todos.length}
            todos={<TodoPanel todos={script.todos} scenes={script.scenes} onReveal={revealTodo} onDone={finishTodo} />}
            scene={
              <Inspector
                onOpenSettings={openSettings}
                scene={scene}
                script={script}
                extra={(() => {
                  const index = scene ? script.scenes.indexOf(scene) : -1;
                  const list = scene ? assistant.shotlistFor(scene.heading, index) : null;
                  return (
                    <>
                      {list ? <ShotlistBlock shotlist={list} onRemove={() => assistant.removeShotlist(list)} /> : null}
                      {scene && (
                        <SceneAlternatives
                          alternatives={alternativesOf(source, index)}
                          onSave={(label) => editScene((text, i) => saveAlternative(text, i, label))}
                          onSwap={(n) => editScene((text, i) => swapAlternative(text, i, n, tAlternatives('previous')))}
                          onRemove={(n) => editScene((text, i) => removeAlternative(text, i, n))}
                        />
                      )}
                    </>
                  );
                })()}
              />
            }
            suggestions={
              <SuggestionsPanel
                cards={bridge.cards}
                documents={assistant.documents}
                status={bridge.status}
                onUse={assistant.use}
                onDiscard={assistant.discard}
                onUseAllFormat={assistant.useAllFormat}
                onRemoveDocument={assistant.removeDocument}
              />
            }
          />
        }
      >
        {/* Hidden, never unmounted. Taking the editor out of the tree would
            throw away the caret, the scroll position and — worst — the undo
            history, and the cards' whole promise is that a drag is one undo
            away from never having happened. */}
        <div style={{ display: view === 'cards' ? 'none' : 'contents' }}>
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
              key={projectId}
              ref={editorRef}
              onElementChange={setElement}
              pageLayout={script.layout}
              initialValue={doc.content}
              value={source}
              onChange={setSource}
              onCaretChange={(offset) => {
                setCaret(offset);
                const now = editorRef.current?.getSelection();
                if (now) setSelection((prev) => (prev.from === now.from && prev.to === now.to && prev.text === now.text ? prev : now));
              }}
              settings={editor}
              dictionary={autocompleteDictionary}
            />
          )}
        </PageCanvas>
        </div>

        {view === 'cards' && (
          <IndexCardBoard
            scenes={script.scenes}
            eighths={script.layout?.sceneEighths}
            caret={caret}
            onMove={moveScene}
            onOpen={openScene}
            onSynopsis={writeSynopsis}
          />
        )}
      </Workspace>

      {toast}

      <ConflictSheet conflict={doc.conflict} mine={source} onResolve={doc.resolve} />

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        source={source}
        pageSize={pageSize}
        pageCount={script.layout?.pageCount ?? null}
        todoCount={script.todos.length}
        revisions={revisions.revisions}
        roles={script.characters.map((character) => character.name)}
        onEditTitlePage={() => setTitleOpen(true)}
      />

      <FindReplace
        open={findOpen && view === 'script'}
        replaceMode={replaceMode}
        onReplaceMode={setReplaceMode}
        onClose={() => {
          setFindOpen(false);
          editorRef.current?.focus();
        }}
        source={source}
        caret={caret}
        sceneIndex={scene ? script.scenes.indexOf(scene) : 0}
        roles={script.characters.map((character) => character.name)}
        onSelect={(from, to) => editorRef.current?.selectRange(from, to)}
        onApply={(edits) => editorRef.current?.applyChanges(edits)}
      />

      <TimelineSheet open={timelineOpen} onClose={() => setTimelineOpen(false)} scenes={script.scenes} onSet={setSceneField} />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      <TitlePageSheet
        open={titleOpen}
        onClose={() => setTitleOpen(false)}
        source={source}
        onApply={(edit) => editorRef.current?.applyChanges([edit])}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        editor={editor}
        onEditorChange={setEditor}
        cards={cardsEnabled}
        onCardsChange={setCardsEnabled}
        styleGuide={styleGuide}
        onStyleGuideChange={setStyleGuide}
        mirror={mirror}
      />
      <RevisionMenu
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        revisions={revisions.revisions}
        current={source}
        onSave={revisions.saveNamed}
        onRestore={(revision) => void restoreRevision(revision)}
      />
      <CastSheet
        open={castOpen}
        onClose={() => setCastOpen(false)}
        characters={script.characters}
        locations={script.locations}
        scenes={script.scenes}
        onReveal={(offset) => {
          setCastOpen(false);
          editorRef.current?.revealOffset(offset);
        }}
        onRename={(from, to) => replaceDictionaryValue('character', from, to)}
        onOpenDictionary={() => {
          setCastOpen(false);
          setDictionaryOpen(true);
        }}
      />
      <DictionarySheet
        open={dictionaryOpen}
        onClose={() => setDictionaryOpen(false)}
        dictionary={autocompleteDictionary}
        onRename={replaceDictionaryValue}
        onRemove={removeDictionaryValue}
        onMerge={mergeDictionaryValue}
        onRebuild={rebuildDictionary}
        onAdd={addDictionaryValue}
      />
    </>
  );
}
