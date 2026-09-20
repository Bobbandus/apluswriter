'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, keymap, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands';
import { fountainTheme } from './fountain/theme';
import { fountainDecorations } from './fountain/decorations';
import { elementFlow, switchElement } from './fountain/elementFlow';
import { elementPicker } from './fountain/picker';
import { fountainAutocomplete } from './fountain/autocomplete';
import { typoGuard } from './fountain/typoGuard';
import { pageView, setPageLayout } from './fountain/pages';
import type { PageLayout } from '@aplus/paginator/layout';
import { effectiveType } from './fountain/intent';
import type { LineType } from '@aplus/fountain/lineClassify';
import {
  DEFAULT_EDITOR_SETTINGS,
  editorSettings,
  type EditorSettings,
} from './fountain/settings';
import type { SwitchableType } from '@aplus/fountain/rewrite';
import type { DictionaryData } from '@aplus/fountain/autocomplete';
import { useFocusMode } from '@/components/shell/FocusModeContext';
import { lockIn } from './fountain/lockIn';
import styles from './ScriptEditor.module.css';

export interface ScriptEditorProps {
  /** The Fountain source. Only read on mount — this is an uncontrolled editor. */
  initialValue: string;
  /** External structural edits (for example a dictionary rename). */
  value?: string;
  onChange: (value: string) => void;
  settings?: Partial<EditorSettings>;
  dictionary?: DictionaryData;
  /** Reports the caret offset, so the navigator can mark the current scene. */
  onCaretChange?: (offset: number) => void;
  autoFocus?: boolean;
  /** Reports the element the caret is in, so the element bar can show it. */
  onElementChange?: (type: LineType) => void;
  /** Where the pages break, from the paginator. Null hides the page view. */
  pageLayout?: PageLayout | null;
}

/**
 * What the rest of the app may ask of the editor.
 *
 * Edits go through `applyChanges` rather than by replacing the document, so
 * they land as ordinary transactions: undoable, and without throwing away the
 * caret. That matters for anything outside the editor that changes the text —
 * the element bar, a rename, a suggestion card the writer accepts.
 */
export interface ScriptEditorHandle {
  switchElement(type: SwitchableType): void;
  applyChanges(changes: { from: number; to: number; insert: string }[]): void;
  getSelection(): { from: number; to: number; text: string };
  /** The live document. Suggestions are resolved against this, never a stale copy. */
  getText(): string;
  revealOffset(offset: number): void;
  /** Selects a stretch and scrolls it into view, without taking focus from wherever the writer is typing. */
  selectRange(from: number, to: number): void;
  focus(): void;
  /**
   * The editor's own history, for the parts of the app that change the text
   * while it is not focused — the index card board — and so cannot rely on
   * the keystroke reaching CodeMirror.
   */
  undo(): void;
  redo(): void;
}

/**
 * The writing surface.
 *
 * Uncontrolled on purpose. Round-tripping every keystroke through React state
 * would mean rebuilding CodeMirror's document on each one, which costs the
 * undo history and the selection — and on a feature-length script, the frame
 * budget too. CodeMirror owns the text; `onChange` reports it outward for
 * saving and indexing.
 */
export const ScriptEditor = forwardRef<ScriptEditorHandle, ScriptEditorProps>(function ScriptEditor({
  initialValue,
  value,
  onChange,
  settings,
  dictionary,
  onCaretChange,
  autoFocus = true,
  onElementChange,
  pageLayout = null,
}, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const settingsCompartment = useRef(new Compartment());
  const lockInCompartment = useRef(new Compartment());
  const focusMode = useFocusMode();
  const autocompleteCompartment = useRef(new Compartment());

  const locale = useLocale();
  const tElements = useTranslations('elements');
  const tEditor = useTranslations('editor');
  const tAutocomplete = useTranslations('autocomplete');

  /* Callbacks are read through refs so a parent re-render never tears down
     and rebuilds the editor, which would drop the caret and the undo stack. */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCaretRef = useRef(onCaretChange);
  onCaretRef.current = onCaretChange;
  const onElementRef = useRef(onElementChange);
  onElementRef.current = onElementChange;

  const resolved: EditorSettings = {
    ...DEFAULT_EDITOR_SETTINGS,
    locale: locale === 'en' ? 'en' : 'sv',
    ...settings,
  };
  const elementLabels: Partial<Record<SwitchableType, string>> = {
    sceneHeading: tElements('sceneHeading'), action: tElements('action'),
    character: tElements('character'), dialogue: tElements('dialogue'),
    parenthetical: tElements('parenthetical'), transition: tElements('transition'),
    note: tElements('note'), lyrics: tElements('lyrics'), section: tElements('section'), synopsis: tElements('synopsis'),
  };

  const chooseElement = (type: SwitchableType) => {
    const instance = view.current;
    if (!instance) return;
    switchElement(type)(instance);
    instance.focus();
  };

  useEffect(() => {
    if (!host.current || view.current) return;

    const extensions: Extension[] = [
      history(),
      drawSelection(),
      rectangularSelection(),
      EditorView.lineWrapping,
      settingsCompartment.current.of(editorSettings.of(resolved)),
      lockInCompartment.current.of(lockIn(focusMode)),
      autocompleteCompartment.current.of(
        fountainAutocomplete({
          dictionary: dictionary ?? { characters: [], locations: [], tags: [] },
          labels: {
            character: tAutocomplete('characters'),
            location: tAutocomplete('locations'),
            time: tAutocomplete('timesOfDay'),
            transition: tAutocomplete('transitions'),
            extension: tAutocomplete('extensions'),
            tag: tAutocomplete('tags'),
            typoFix: tAutocomplete('typoFix', { name: '{name}' }),
          },
        }),
      ),
      fountainTheme,
      fountainDecorations,
      typoGuard,
      pageView(),
      elementPicker(elementLabels, tEditor('elementPickerHint'), switchElement),
      elementFlow(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        if (update.selectionSet || update.docChanged) {
          onCaretRef.current?.(update.state.selection.main.head);
          const caretLine = update.state.doc.lineAt(update.state.selection.main.head).number;
          onElementRef.current?.(effectiveType(update.state, caretLine));
        }
      }),
      EditorView.contentAttributes.of((editorView) => ({
        // Off unless the writer turned it on. When it is on, decorations.ts switches it off
        // again for every line that is not dialogue or action.
        spellcheck: editorView.state.facet(editorSettings).spellcheck ? 'true' : 'false',
        'aria-label': tEditor('placeholder'),
      })),
    ];

    const instance = new EditorView({
      state: EditorState.create({ doc: initialValue, extensions }),
      parent: host.current,
    });

    view.current = instance;
    if (autoFocus) instance.focus();

    return () => {
      instance.destroy();
      view.current = null;
    };
    // Mount once. Settings changes are handled by the reconfigure below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Settings changes reconfigure the running editor. Rebuilding it instead
     would lose the caret, the selection and the whole undo history — and a
     writer who flips a preference should not be punished for it. */
  useEffect(() => {
    view.current?.dispatch({
      effects: settingsCompartment.current.reconfigure(editorSettings.of(resolved)),
    });
  }, [resolved.renderNotes, resolved.autoUppercase, resolved.autoContd, resolved.tabOnCharacter, resolved.locale, resolved.spellcheck]);

  // Focus mode dims all but the paragraph being written and holds the caret line steady.
  useEffect(() => {
    view.current?.dispatch({ effects: lockInCompartment.current.reconfigure(lockIn(focusMode)) });
  }, [focusMode]);

  useEffect(() => {
    view.current?.dispatch({
      effects: autocompleteCompartment.current.reconfigure(
        fountainAutocomplete({
          dictionary: dictionary ?? { characters: [], locations: [], tags: [] },
          labels: {
            character: tAutocomplete('characters'),
            location: tAutocomplete('locations'),
            time: tAutocomplete('timesOfDay'),
            transition: tAutocomplete('transitions'),
            extension: tAutocomplete('extensions'),
            tag: tAutocomplete('tags'),
            typoFix: tAutocomplete('typoFix', { name: '{name}' }),
          },
        }),
      ),
    });
  }, [dictionary, tAutocomplete]);

  // Most edits originate in CodeMirror and are already present. Structural
  // tools may edit the source outside the view; reflect only those edits.
  useEffect(() => {
    const instance = view.current;
    if (!instance || value === undefined || value === instance.state.doc.toString()) return;
    const head = Math.min(instance.state.selection.main.head, value.length);
    instance.dispatch({
      changes: { from: 0, to: instance.state.doc.length, insert: value },
      selection: { anchor: head },
      userEvent: 'input.external',
    });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: setPageLayout.of(pageLayout) });
  }, [pageLayout]);

  useImperativeHandle(
    ref,
    () => ({
      switchElement: (type) => chooseElement(type),
      applyChanges: (changes) => {
        const instance = view.current;
        if (!instance || changes.length === 0) return;
        instance.dispatch({ changes, userEvent: 'input.external', scrollIntoView: true });
      },
      getText: () => view.current?.state.doc.toString() ?? '',
      getSelection: () => {
        const instance = view.current;
        if (!instance) return { from: 0, to: 0, text: '' };
        const { from, to } = instance.state.selection.main;
        return { from, to, text: instance.state.sliceDoc(from, to) };
      },
      revealOffset: (offset) => {
        const instance = view.current;
        if (!instance) return;
        const anchor = Math.max(0, Math.min(offset, instance.state.doc.length));
        instance.dispatch({
          selection: { anchor },
          effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 80 }),
        });
        instance.focus();
      },
      selectRange: (from, to) => {
        const instance = view.current;
        if (!instance) return;
        const max = instance.state.doc.length;
        instance.dispatch({
          selection: { anchor: Math.max(0, Math.min(from, max)), head: Math.max(0, Math.min(to, max)) },
          effects: EditorView.scrollIntoView(Math.max(0, Math.min(from, max)), { y: 'center' }),
        });
      },
      focus: () => view.current?.focus(),
      undo: () => {
        if (view.current) undo(view.current);
      },
      redo: () => {
        if (view.current) redo(view.current);
      },
    }),
    // chooseElement only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return <div ref={host} data-testid="script-editor" className={styles.surface} />;
});
